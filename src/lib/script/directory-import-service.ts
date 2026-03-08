/**
 * Directory Import Service
 * 从本地项目目录读取 JSON 文件，合并为 MoyinImportData 格式后导入。
 * 支持首次导入和增量更新。
 */
import { importMoyinProject, validateImportData, type ImportResult } from './import-service';
import { useProjectStore } from '@/stores/project-store';
import { useScriptStore } from '@/stores/script-store';
import { useCharacterLibraryStore } from '@/stores/character-library-store';
import { useSceneStore } from '@/stores/scene-store';
import { CURSOR_RULES_CONTENT } from './cursor-rules-template';

export interface DirectoryProject {
  project: Record<string, unknown>;
  characters: Record<string, unknown>[];
  scenes: Record<string, unknown>[];
  episodes: Record<string, unknown>[];
  shots: Record<string, unknown>[];
}

export interface DirectoryImportResult extends ImportResult {
  warnings: string[];
}

interface FsApi {
  readdir: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
}

function getFsApi(): FsApi {
  const w = window as any;
  if (w.directoryFs) return w.directoryFs;
  throw new Error('目录文件操作 API 不可用（需要桌面端）');
}

/**
 * 初始化一个新的项目目录：创建子目录结构和 .cursor/rules 文件
 */
export async function initProjectDirectory(dirPath: string, projectName: string): Promise<void> {
  const fs = getFsApi();
  const dirs = [
    'characters',
    'scenes',
    'episodes',
    'shots',
    'media/images',
    'media/videos',
    '.cursor/rules',
  ];
  for (const sub of dirs) {
    await fs.mkdir(`${dirPath}/${sub}`);
  }

  // 写入 Cursor 规则文件
  await fs.writeFile(`${dirPath}/.cursor/rules/moyin-project.mdc`, CURSOR_RULES_CONTENT);

  // 写入初始 project.json
  const hasProject = await fs.exists(`${dirPath}/project.json`);
  if (!hasProject) {
    await fs.writeFile(`${dirPath}/project.json`, JSON.stringify({
      name: projectName,
      title: projectName,
      language: '中文',
      promptLanguage: 'zh+en',
      styleId: 'cinematic',
      targetDuration: '5min',
    }, null, 2));
  }
}

/**
 * 从项目目录读取所有 JSON 文件，合并为导入数据
 */
export async function readProjectDirectory(dirPath: string): Promise<{
  data: DirectoryProject;
  warnings: string[];
}> {
  const fs = getFsApi();
  const warnings: string[] = [];

  // 读取 project.json
  let project: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(`${dirPath}/project.json`);
    project = JSON.parse(raw);
  } catch (e) {
    warnings.push('project.json 读取失败或不存在，使用默认值');
    project = { name: dirPath.split('/').pop() || '未命名项目' };
  }

  // 读取各子目录中的 JSON 文件
  const characters = await readJsonDir(fs, `${dirPath}/characters`, warnings, '角色');
  const scenes = await readJsonDir(fs, `${dirPath}/scenes`, warnings, '场景');
  const episodes = await readJsonDir(fs, `${dirPath}/episodes`, warnings, '剧集');
  const shots = await readJsonDir(fs, `${dirPath}/shots`, warnings, '分镜');

  return {
    data: { project, characters, scenes, episodes, shots },
    warnings,
  };
}

async function readJsonDir(
  fs: FsApi,
  dirPath: string,
  warnings: string[],
  label: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  try {
    const dirExists = await fs.exists(dirPath);
    if (!dirExists) return items;

    const files = await fs.readdir(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(`${dirPath}/${file}`);
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          items.push(parsed);
        }
      } catch (e) {
        warnings.push(`${label}文件 ${file} 解析失败，已跳过`);
      }
    }
  } catch {
    // directory doesn't exist, that's fine
  }
  return items;
}

/**
 * 将目录读取的数据转换为 MoyinImportData 格式并做容错校验
 */
export function convertToImportData(dirData: DirectoryProject): {
  importData: Record<string, unknown>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const project = dirData.project;

  // 收集有效的 ID 集合，用于引用校验
  const charIds = new Set(dirData.characters.map(c => c.id as string).filter(Boolean));
  const sceneIds = new Set(dirData.scenes.map(s => s.id as string).filter(Boolean));
  const epIds = new Set(dirData.episodes.map(e => e.id as string).filter(Boolean));

  // 校验并修复角色
  const characters = dirData.characters.filter(c => {
    if (!c.id || !c.name) {
      warnings.push(`角色缺少 id 或 name，已跳过: ${JSON.stringify(c).slice(0, 60)}`);
      return false;
    }
    return true;
  }).map(c => ({
    ...c,
    tags: Array.isArray(c.tags) ? c.tags : ['supporting'],
  }));

  // 校验并修复场景
  const scenes = dirData.scenes.filter(s => {
    if (!s.id) {
      warnings.push(`场景缺少 id，已跳过: ${JSON.stringify(s).slice(0, 60)}`);
      return false;
    }
    if (!s.location) (s as any).location = s.name || '未知地点';
    if (!s.time) (s as any).time = 'day';
    if (!s.atmosphere) (s as any).atmosphere = '';
    return true;
  });

  // 构建 episodes，处理内嵌的 rawScript
  const episodes: Record<string, unknown>[] = [];
  const episodeRawScripts: Record<string, unknown>[] = [];

  for (const ep of dirData.episodes) {
    if (!ep.id || ep.index === undefined) {
      warnings.push(`剧集缺少 id 或 index，已跳过: ${JSON.stringify(ep).slice(0, 60)}`);
      continue;
    }
    const rawScript = ep.rawScript as Record<string, unknown> | undefined;
    episodes.push({
      id: ep.id,
      index: ep.index,
      title: ep.title || `第${ep.index}集`,
      description: ep.description,
      sceneIds: Array.isArray(ep.sceneIds) ? ep.sceneIds : [],
    });
    if (rawScript) {
      episodeRawScripts.push({
        episodeIndex: ep.index,
        title: ep.title || `第${ep.index}集`,
        synopsis: rawScript.synopsis || '',
        keyEvents: Array.isArray(rawScript.keyEvents) ? rawScript.keyEvents : [],
        rawContent: rawScript.rawContent || '',
        scenes: [],
        shotGenerationStatus: 'completed',
      });
    }
  }

  // 校验并修复分镜
  const shots = dirData.shots.filter(s => {
    if (!s.id) {
      warnings.push(`分镜缺少 id，已跳过`);
      return false;
    }
    if (!s.sceneRefId || !sceneIds.has(s.sceneRefId as string)) {
      warnings.push(`分镜 ${s.id} 的 sceneRefId "${s.sceneRefId}" 不存在于场景列表`);
    }
    if (!s.actionSummary) (s as any).actionSummary = '';
    if (!Array.isArray(s.characterIds)) (s as any).characterIds = [];
    if (!s.characterVariations) (s as any).characterVariations = {};

    // 校验角色引用
    const cIds = (s.characterIds as string[]) || [];
    const invalidChars = cIds.filter(id => !charIds.has(id));
    if (invalidChars.length > 0) {
      warnings.push(`分镜 ${s.id} 引用了不存在的角色: ${invalidChars.join(', ')}`);
    }

    return true;
  }).map((s, idx) => ({
    ...s,
    index: s.index ?? idx + 1,
  }));

  const importData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: (project.name as string) || '未命名项目',
      ...project,
    },
    characters,
    scenes,
    episodes,
    episodeRawScripts,
    shots,
  };

  return { importData, warnings };
}

/**
 * 首次从目录导入：读取目录 → 转换 → 校验 → 导入
 */
export async function importFromDirectory(dirPath: string): Promise<DirectoryImportResult> {
  const { data, warnings: readWarnings } = await readProjectDirectory(dirPath);
  const { importData, warnings: convertWarnings } = convertToImportData(data);
  const allWarnings = [...readWarnings, ...convertWarnings];

  try {
    const validated = validateImportData(importData);
    const result = importMoyinProject(validated);
    return { ...result, warnings: allWarnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`导入失败: ${msg}\n${allWarnings.length > 0 ? '警告:\n' + allWarnings.join('\n') : ''}`);
  }
}

/**
 * 增量更新：当文件变化时，重新读取目录并更新已关联的项目。
 * 采用"整体替换 scriptData"的策略，避免空项目缺少 scriptData 导致操作被跳过。
 */
export async function syncDirectoryToProject(
  dirPath: string,
  projectId: string
): Promise<{ updated: boolean; warnings: string[] }> {
  const { data, warnings: readWarnings } = await readProjectDirectory(dirPath);
  const { importData, warnings: convertWarnings } = convertToImportData(data);
  const allWarnings = [...readWarnings, ...convertWarnings];

  const scriptStore = useScriptStore.getState();
  const charStore = useCharacterLibraryStore.getState();
  const sceneStoreState = useSceneStore.getState();

  scriptStore.ensureProject(projectId);
  const project = scriptStore.projects[projectId];
  if (!project) return { updated: false, warnings: ['项目不存在'] };

  const impData = importData as any;
  const projectName = impData.project?.name || '项目';

  // 1. 更新项目背景
  if (impData.project) {
    scriptStore.setProjectBackground(projectId, {
      title: impData.project.title || impData.project.name,
      genre: impData.project.genre,
      era: impData.project.era,
      outline: impData.project.outline || '',
      characterBios: impData.project.characterBios || '',
      worldSetting: impData.project.worldSetting,
      themes: impData.project.themes,
      totalEpisodes: impData.project.totalEpisodes,
    });
  }

  // 2. 构建角色列表 + 同步到角色库
  const charFolderId = charStore.getOrCreateProjectFolder(projectId, projectName);
  const characterIdMap: Record<string, string> = { ...project.characterIdMap };
  const existingCharMap = new Map((project.scriptData?.characters || []).map(c => [c.id, c]));

  const scriptCharacters = ((impData.characters || []) as any[]).map((c: any) => {
    let libId = characterIdMap[c.id];
    if (existingCharMap.has(c.id) && libId) {
      charStore.updateCharacter(libId, c);
    } else {
      libId = charStore.addCharacter({
        name: c.name,
        description: c.appearance || '',
        visualTraits: c.visualPromptEn || '',
        projectId, folderId: charFolderId,
        gender: c.gender, age: c.age, personality: c.personality,
        role: c.role, traits: c.traits, skills: c.skills,
        keyActions: c.keyActions, appearance: c.appearance,
        relationships: c.relationships, tags: c.tags, notes: c.notes,
        views: [],
      });
      characterIdMap[c.id] = libId;
    }
    return {
      id: c.id, name: c.name, gender: c.gender, age: c.age,
      personality: c.personality, role: c.role, traits: c.traits,
      skills: c.skills, keyActions: c.keyActions, appearance: c.appearance,
      relationships: c.relationships, tags: c.tags, notes: c.notes,
      baseCharacterId: c.baseCharacterId, stageInfo: c.stageInfo,
      stageCharacterIds: c.stageCharacterIds,
      visualPromptEn: c.visualPromptEn, visualPromptZh: c.visualPromptZh,
      characterLibraryId: libId,
    };
  });

  // 3. 构建场景列表 + 同步到场景库
  const sceneFolderId = sceneStoreState.getOrCreateProjectFolder(projectId, projectName);
  const sceneIdMap: Record<string, string> = { ...project.sceneIdMap };
  const existingSceneMap = new Map((project.scriptData?.scenes || []).map(s => [s.id, s]));

  const scriptScenes = ((impData.scenes || []) as any[]).map((s: any) => {
    let libId = sceneIdMap[s.id];
    if (existingSceneMap.has(s.id) && libId) {
      sceneStoreState.updateScene(libId, s);
    } else {
      libId = sceneStoreState.addScene({
        name: s.name || s.location,
        location: s.location, time: s.time, atmosphere: s.atmosphere,
        projectId, folderId: sceneFolderId,
        visualPrompt: s.visualPrompt, tags: s.tags, notes: s.notes,
      });
      sceneIdMap[s.id] = libId;
    }
    return {
      id: s.id, name: s.name, location: s.location, time: s.time,
      atmosphere: s.atmosphere, visualPrompt: s.visualPrompt,
      tags: s.tags, notes: s.notes, architectureStyle: s.architectureStyle,
      lightingDesign: s.lightingDesign, colorPalette: s.colorPalette,
      keyProps: s.keyProps, spatialLayout: s.spatialLayout, eraDetails: s.eraDetails,
      sceneLibraryId: libId,
    };
  });

  // 4. 构建剧集列表
  const episodes = ((impData.episodes || []) as any[]).map((ep: any) => ({
    id: ep.id,
    index: ep.index,
    title: ep.title,
    description: ep.description,
    sceneIds: ep.sceneIds || [],
  }));

  // 5. 一次性设置完整的 scriptData（避免依赖 scriptData 已存在的问题）
  scriptStore.setScriptData(projectId, {
    title: impData.project?.title || impData.project?.name || projectName,
    genre: impData.project?.genre,
    language: impData.project?.language || '中文',
    targetDuration: impData.project?.targetDuration,
    characters: scriptCharacters as any[],
    scenes: scriptScenes as any[],
    episodes,
    storyParagraphs: project.scriptData?.storyParagraphs || [],
  });

  scriptStore.setMappings(projectId, { characterIdMap, sceneIdMap });

  // 6. 设置分镜
  if (impData.shots) {
    const shots = (impData.shots as any[]).map((s: any, idx: number) => ({
      id: s.id,
      index: s.index ?? idx + 1,
      episodeId: s.episodeId,
      sceneRefId: s.sceneRefId,
      actionSummary: s.actionSummary || '',
      visualDescription: s.visualDescription,
      characterIds: s.characterIds || [],
      characterNames: s.characterNames,
      characterVariations: s.characterVariations || {},
      shotSize: s.shotSize,
      duration: s.duration,
      cameraMovement: s.cameraMovement,
      dialogue: s.dialogue,
      imageStatus: 'idle' as const,
      imageProgress: 0,
      videoStatus: 'idle' as const,
      videoProgress: 0,
    }));
    scriptStore.setShots(projectId, shots);
  }

  // 7. 设置原始剧本
  if (impData.episodeRawScripts?.length > 0) {
    scriptStore.setEpisodeRawScripts(projectId, impData.episodeRawScripts);
  }

  // 8. 设置样式和配置
  if (impData.project?.styleId) {
    scriptStore.setStyleId(projectId, impData.project.styleId);
  }
  if (impData.project?.promptLanguage) {
    scriptStore.setPromptLanguage(projectId, impData.project.promptLanguage);
  }

  return { updated: true, warnings: allWarnings };
}
