/**
 * Directory Export Service
 * 将魔音项目数据导出为本地目录格式，供 Cursor 编辑。
 */
import { useScriptStore } from '@/stores/script-store';
import { initProjectDirectory } from './directory-import-service';
import { CURSOR_RULES_CONTENT } from './cursor-rules-template';
import { VALIDATE_SCRIPT_CONTENT } from './validate-script-template';

interface FsApi {
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
}

function getFsApi(): FsApi {
  const w = window as any;
  if (w.directoryFs) return w.directoryFs;
  throw new Error('目录文件操作 API 不可用（需要桌面端）');
}

export async function exportProjectToDirectory(
  projectId: string,
  dirPath: string
): Promise<{ fileCount: number }> {
  const fs = getFsApi();
  const project = useScriptStore.getState().projects[projectId];
  if (!project) throw new Error('项目不存在');

  const scriptData = project.scriptData;
  const background = project.projectBackground;

  await initProjectDirectory(dirPath, background?.title || '项目');

  let fileCount = 0;

  // project.json — 包含完整的项目元数据
  const projectJson: Record<string, unknown> = {
    name: background?.title || '项目',
    title: scriptData?.title,
    genre: scriptData?.genre || background?.genre,
    era: background?.era,
    language: scriptData?.language || '中文',
    outline: background?.outline,
    characterBios: background?.characterBios,
    worldSetting: background?.worldSetting,
    themes: background?.themes,
    promptLanguage: project.promptLanguage,
    totalEpisodes: background?.totalEpisodes,
    styleId: project.styleId,
    targetDuration: scriptData?.targetDuration || project.targetDuration,
    timelineSetting: background?.timelineSetting,
    storyStartYear: background?.storyStartYear,
    storyEndYear: background?.storyEndYear,
    sceneCount: project.sceneCount,
    shotCount: project.shotCount,
  };
  await fs.writeFile(`${dirPath}/project.json`, JSON.stringify(projectJson, null, 2));
  fileCount++;

  // Characters
  if (scriptData?.characters) {
    for (const char of scriptData.characters) {
      const charJson: Record<string, unknown> = {
        id: char.id,
        name: char.name,
        gender: char.gender,
        age: char.age,
        personality: char.personality,
        role: char.role,
        traits: char.traits,
        skills: char.skills,
        keyActions: char.keyActions,
        appearance: char.appearance,
        relationships: char.relationships,
        tags: char.tags || ['supporting'],
        notes: char.notes,
        visualPromptEn: char.visualPromptEn,
        visualPromptZh: char.visualPromptZh,
      };
      if (char.baseCharacterId) charJson.baseCharacterId = char.baseCharacterId;
      if (char.stageInfo) charJson.stageInfo = char.stageInfo;
      if (char.stageCharacterIds) charJson.stageCharacterIds = char.stageCharacterIds;

      await fs.writeFile(`${dirPath}/characters/${char.id}.json`, JSON.stringify(charJson, null, 2));
      fileCount++;
    }
  }

  // Scenes
  if (scriptData?.scenes) {
    for (const scene of scriptData.scenes) {
      const sceneJson: Record<string, unknown> = {
        id: scene.id,
        name: scene.name,
        location: scene.location,
        time: scene.time,
        atmosphere: scene.atmosphere,
        visualPrompt: scene.visualPrompt,
        tags: scene.tags,
        notes: scene.notes,
        architectureStyle: scene.architectureStyle,
        lightingDesign: scene.lightingDesign,
        colorPalette: scene.colorPalette,
        keyProps: scene.keyProps,
        spatialLayout: scene.spatialLayout,
        eraDetails: scene.eraDetails,
      };
      await fs.writeFile(`${dirPath}/scenes/${scene.id}.json`, JSON.stringify(sceneJson, null, 2));
      fileCount++;
    }
  }

  // Episodes
  if (scriptData?.episodes) {
    const rawScripts = project.episodeRawScripts || [];
    for (const ep of scriptData.episodes) {
      const rawScript = rawScripts.find(r => r.episodeIndex === ep.index);
      const epJson: Record<string, unknown> = {
        id: ep.id,
        index: ep.index,
        title: ep.title,
        description: ep.description,
        sceneIds: ep.sceneIds || [],
      };
      if (rawScript) {
        epJson.rawScript = {
          synopsis: rawScript.synopsis,
          keyEvents: rawScript.keyEvents,
          rawContent: rawScript.rawContent,
        };
      }
      await fs.writeFile(`${dirPath}/episodes/${ep.id}.json`, JSON.stringify(epJson, null, 2));
      fileCount++;
    }
  }

  // Shots
  const shots = project.shots || [];
  for (const shot of shots) {
    const shotJson: Record<string, unknown> = {
      id: shot.id,
      index: shot.index,
      episodeId: shot.episodeId,
      sceneRefId: shot.sceneRefId,
      actionSummary: shot.actionSummary,
      dialogue: shot.dialogue || '',
      characterIds: shot.characterIds || [],
      characterNames: shot.characterNames || [],
      characterVariations: shot.characterVariations || {},
      shotSize: shot.shotSize,
      duration: shot.duration,
      cameraMovement: shot.cameraMovement,
    };
    if (shot.visualDescription) shotJson.visualDescription = shot.visualDescription;
    if (shot.imagePrompt) shotJson.imagePrompt = shot.imagePrompt;
    if (shot.imagePromptZh) shotJson.imagePromptZh = shot.imagePromptZh;
    if (shot.videoPrompt) shotJson.videoPrompt = shot.videoPrompt;

    await fs.writeFile(`${dirPath}/shots/${shot.id}.json`, JSON.stringify(shotJson, null, 2));
    fileCount++;
  }

  // script.md — 各集原始剧本文本（方便 Cursor 阅读上下文）
  const rawScripts = project.episodeRawScripts || [];
  if (rawScripts.length > 0) {
    const md = rawScripts.map(rs =>
      `# ${rs.title}\n\n${rs.synopsis ? `> ${rs.synopsis}\n\n` : ''}${rs.rawContent || ''}`
    ).join('\n\n---\n\n');
    await fs.writeFile(`${dirPath}/script.md`, md);
    fileCount++;
  }

  // raw-input.md — 用户最初输入的完整剧本原文
  if (project.rawScript) {
    await fs.writeFile(`${dirPath}/raw-input.md`, project.rawScript);
    fileCount++;
  }

  // metadata.md — AI 生成的项目元数据摘要（全局参考信息）
  if (project.metadataMarkdown) {
    await fs.writeFile(`${dirPath}/metadata.md`, project.metadataMarkdown);
    fileCount++;
  }

  // validate.js — 数据校验脚本
  await fs.writeFile(`${dirPath}/validate.js`, VALIDATE_SCRIPT_CONTENT);
  fileCount++;

  return { fileCount };
}
