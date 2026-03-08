import { useScriptStore } from '@/stores/script-store';
import { useCharacterLibraryStore } from '@/stores/character-library-store';
import { useSceneStore } from '@/stores/scene-store';
import { useMediaPanelStore, type Tab } from '@/stores/media-panel-store';
import { useProjectStore } from '@/stores/project-store';
import { estimateTokens } from '@/lib/ai/model-registry';
import type { ScriptCharacter, ScriptScene, Episode, Shot } from '@/types/script';

export interface EditContext {
  activeTab: Tab;
  projectName: string;
  projectId: string;
  projectBackground?: string;
  characters: ContextCharacter[];
  scenes: ContextScene[];
  episodes: ContextEpisode[];
  shots: ContextShot[];
  selectedCharacterId?: string | null;
  selectedSceneId?: string | null;
}

interface ContextCharacter {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  personality?: string;
  role?: string;
  traits?: string;
  skills?: string;
  keyActions?: string;
  appearance?: string;
  visualPromptEn?: string;
  visualPromptZh?: string;
  relationships?: string;
  tags?: string[];
  notes?: string;
  characterLibraryId?: string;
}

interface ContextScene {
  id: string;
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  tags?: string[];
  notes?: string;
  sceneLibraryId?: string;
  architectureStyle?: string;
  lightingDesign?: string;
  colorPalette?: string;
}

interface ContextEpisode {
  id: string;
  index: number;
  title: string;
  description?: string;
  sceneIds: string[];
}

interface ContextShot {
  id: string;
  index: number;
  episodeId?: string;
  sceneRefId: string;
  actionSummary: string;
  dialogue?: string;
  shotSize?: string;
  cameraMovement?: string;
  characterIds: string[];
  characterNames?: string[];
  duration?: number;
}

const MAX_CONTEXT_TOKENS = 6000;

function pickCharacterFields(c: ScriptCharacter): ContextCharacter {
  return {
    id: c.id,
    name: c.name,
    gender: c.gender,
    age: c.age,
    personality: c.personality,
    role: c.role,
    traits: c.traits,
    skills: c.skills,
    keyActions: c.keyActions,
    appearance: c.appearance,
    visualPromptEn: c.visualPromptEn,
    visualPromptZh: c.visualPromptZh,
    relationships: c.relationships,
    tags: c.tags,
    notes: c.notes,
    characterLibraryId: c.characterLibraryId,
  };
}

function pickSceneFields(s: ScriptScene): ContextScene {
  return {
    id: s.id,
    name: s.name,
    location: s.location,
    time: s.time,
    atmosphere: s.atmosphere,
    visualPrompt: s.visualPrompt,
    tags: s.tags,
    notes: s.notes,
    sceneLibraryId: s.sceneLibraryId,
    architectureStyle: s.architectureStyle,
    lightingDesign: s.lightingDesign,
    colorPalette: s.colorPalette,
  };
}

function pickEpisodeFields(e: Episode): ContextEpisode {
  return {
    id: e.id,
    index: e.index,
    title: e.title,
    description: e.description,
    sceneIds: e.sceneIds,
  };
}

function pickShotFields(s: Shot): ContextShot {
  return {
    id: s.id,
    index: s.index,
    episodeId: s.episodeId,
    sceneRefId: s.sceneRefId,
    actionSummary: s.actionSummary,
    dialogue: s.dialogue,
    shotSize: s.shotSize,
    cameraMovement: s.cameraMovement,
    characterIds: s.characterIds || [],
    characterNames: s.characterNames,
    duration: s.duration,
  };
}

export function buildEditContext(): EditContext {
  const activeTab = useMediaPanelStore.getState().activeTab;
  const scriptStore = useScriptStore.getState();
  const charStore = useCharacterLibraryStore.getState();
  const sceneStore = useSceneStore.getState();
  const projectStore = useProjectStore.getState();

  const projectId = scriptStore.activeProjectId || projectStore.activeProjectId || '';
  const project = projectStore.projects.find((p) => p.id === projectId);
  const scriptProject = projectId ? scriptStore.projects[projectId] : null;
  const scriptData = scriptProject?.scriptData;

  const characters = (scriptData?.characters || []).map(pickCharacterFields);
  const scenes = (scriptData?.scenes || []).map(pickSceneFields);
  const episodes = (scriptData?.episodes || []).map(pickEpisodeFields);
  const shots = (scriptProject?.shots || []).map(pickShotFields);

  const bgParts: string[] = [];
  if (scriptProject?.projectBackground) {
    const bg = scriptProject.projectBackground;
    if (bg.title) bgParts.push(`剧名: ${bg.title}`);
    if (bg.genre) bgParts.push(`类型: ${bg.genre}`);
    if (bg.era) bgParts.push(`时代: ${bg.era}`);
    if (bg.outline) bgParts.push(`大纲: ${bg.outline}`);
  }

  return {
    activeTab,
    projectName: project?.name || '未命名项目',
    projectId,
    projectBackground: bgParts.length > 0 ? bgParts.join('\n') : undefined,
    characters,
    scenes,
    episodes,
    shots,
    selectedCharacterId: charStore.selectedCharacterId,
    selectedSceneId: sceneStore.selectedSceneId,
  };
}

/**
 * Serialize context into a concise text block for the AI system prompt.
 * Automatically trims if the result exceeds the token budget.
 */
export function serializeContext(ctx: EditContext): string {
  const sections: string[] = [];

  sections.push(`## 项目信息\n项目: ${ctx.projectName}`);

  if (ctx.projectBackground) {
    sections.push(`## 项目背景\n${ctx.projectBackground}`);
  }

  if (ctx.episodes.length > 0) {
    const epLines = ctx.episodes.map(
      (e) => `- [${e.id}] 第${e.index}集「${e.title}」${e.description ? ': ' + e.description : ''} (场景: ${e.sceneIds.join(', ')})`
    );
    sections.push(`## 剧集列表 (共${ctx.episodes.length}集)\n${epLines.join('\n')}`);
  }

  if (ctx.characters.length > 0) {
    const charLines = ctx.characters.map((c) => {
      const attrs: string[] = [`id=${c.id}`, `name=${c.name}`];
      if (c.gender) attrs.push(`性别=${c.gender}`);
      if (c.age) attrs.push(`年龄=${c.age}`);
      if (c.personality) attrs.push(`性格=${c.personality}`);
      if (c.role) attrs.push(`身份=${c.role}`);
      if (c.appearance) attrs.push(`外貌=${c.appearance}`);
      if (c.visualPromptZh) attrs.push(`中文视觉提示词=${c.visualPromptZh}`);
      if (c.visualPromptEn) attrs.push(`英文视觉提示词=${c.visualPromptEn}`);
      if (c.relationships) attrs.push(`关系=${c.relationships}`);
      if (c.characterLibraryId) attrs.push(`libraryId=${c.characterLibraryId}`);
      return `- ${attrs.join(', ')}`;
    });
    sections.push(`## 角色列表 (共${ctx.characters.length}个)\n${charLines.join('\n')}`);
  }

  if (ctx.scenes.length > 0) {
    const sceneLines = ctx.scenes.map((s) => {
      const attrs: string[] = [`id=${s.id}`];
      if (s.name) attrs.push(`name=${s.name}`);
      attrs.push(`location=${s.location}`, `time=${s.time}`, `atmosphere=${s.atmosphere}`);
      if (s.sceneLibraryId) attrs.push(`libraryId=${s.sceneLibraryId}`);
      return `- ${attrs.join(', ')}`;
    });
    sections.push(`## 场景列表 (共${ctx.scenes.length}个)\n${sceneLines.join('\n')}`);
  }

  if (ctx.shots.length > 0) {
    const charIdToName: Record<string, string> = {};
    for (const c of ctx.characters) charIdToName[c.id] = c.name;

    const shotLines = ctx.shots.map((s) => {
      const charNames = (s.characterNames && s.characterNames.length > 0)
        ? s.characterNames.join('、')
        : s.characterIds.map(id => charIdToName[id] || `?${id}`).join('、');
      const attrs: string[] = [
        `id=${s.id}`,
        `#${s.index}`,
        `场景=${s.sceneRefId}`,
      ];
      if (s.shotSize) attrs.push(`景别=${s.shotSize}`);
      if (charNames) attrs.push(`出场角色=[${charNames}]`);
      if (s.dialogue) attrs.push(`对白="${s.dialogue.slice(0, 30)}"`);
      attrs.push(`动作=${s.actionSummary?.slice(0, 40) || ''}`);
      return `- ${attrs.join(', ')}`;
    });
    sections.push(`## 分镜列表 (共${ctx.shots.length}个)\n${shotLines.join('\n')}`);
  }

  let result = sections.join('\n\n');

  const tokens = estimateTokens(result);
  if (tokens > MAX_CONTEXT_TOKENS) {
    result = truncateContext(ctx, MAX_CONTEXT_TOKENS);
  }

  return result;
}

function truncateContext(ctx: EditContext, maxTokens: number): string {
  const sections: string[] = [];

  sections.push(`## 项目信息\n项目: ${ctx.projectName}`);

  if (ctx.characters.length > 0) {
    const charLines = ctx.characters.map(
      (c) => `- [${c.id}] ${c.name}${c.gender ? '(' + c.gender + ')' : ''}${c.age ? ' ' + c.age : ''}`
    );
    sections.push(`## 角色列表 (共${ctx.characters.length}个)\n${charLines.join('\n')}`);
  }

  if (ctx.scenes.length > 0) {
    const sceneLines = ctx.scenes.map(
      (s) => `- [${s.id}] ${s.name || s.location} (${s.time}, ${s.atmosphere})`
    );
    sections.push(`## 场景列表 (共${ctx.scenes.length}个)\n${sceneLines.join('\n')}`);
  }

  if (ctx.episodes.length > 0) {
    const epLines = ctx.episodes.map(
      (e) => `- [${e.id}] 第${e.index}集「${e.title}」`
    );
    sections.push(`## 剧集 (共${ctx.episodes.length}集)\n${epLines.join('\n')}`);
  }

  if (ctx.shots.length > 0) {
    const shotLines = ctx.shots.map(
      (s) => `- [${s.id}] #${s.index} 角色=[${(s.characterNames || []).join('、')}] ${s.actionSummary?.slice(0, 30) || ''}`
    );
    sections.push(`## 分镜 (共${ctx.shots.length}个)\n${shotLines.join('\n')}`);
  }

  let result = sections.join('\n\n');
  const tokens = estimateTokens(result);
  if (tokens > maxTokens) {
    const ratio = maxTokens / tokens;
    const cutLen = Math.floor(result.length * ratio * 0.9);
    result = result.slice(0, cutLen) + '\n... (上下文已截断)';
  }

  return result;
}
