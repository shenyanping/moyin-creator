import { useScriptStore } from '@/stores/script-store';
import { useCharacterLibraryStore } from '@/stores/character-library-store';
import { useSceneStore } from '@/stores/scene-store';
import { useProjectStore } from '@/stores/project-store';
import { nanoid } from 'nanoid';
import type { EditSuggestion, EditChange, EditAction, EditSnapshot } from '@/stores/assistant-store';
import type { EditContext } from './context-builder';
import type { ScriptCharacter, ScriptScene, Episode } from '@/types/script';

export interface AIEditInstruction {
  action?: 'edit' | 'add';
  targetType: 'character' | 'scene' | 'episode' | 'shot';
  targetId: string;
  targetName: string;
  changes: Record<string, unknown>;
}

export interface AIEditResponse {
  reply: string;
  edits?: AIEditInstruction[];
}

/**
 * Parse the AI response text into a structured edit response.
 * Handles cases where the response is pure JSON or contains JSON within text.
 */
export function parseEditResponse(raw: string): AIEditResponse {
  const trimmed = raw.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.reply !== undefined) {
      return normalizeResponse(parsed);
    }
  } catch {
    // not pure JSON
  }

  // Try extracting JSON from markdown code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed.reply !== undefined) {
        return normalizeResponse(parsed);
      }
    } catch {
      // malformed JSON inside code block
    }
  }

  // Try finding JSON object pattern in text
  const jsonMatch = trimmed.match(/\{[\s\S]*"reply"\s*:\s*"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalizeResponse(parsed);
    } catch {
      // malformed
    }
  }

  // Fallback: treat entire response as plain reply with no edits
  return { reply: trimmed, edits: [] };
}

function normalizeResponse(parsed: any): AIEditResponse {
  return {
    reply: String(parsed.reply || ''),
    edits: Array.isArray(parsed.edits)
      ? parsed.edits.map((e: any) => ({
          action: e.action || 'edit',
          targetType: e.targetType,
          targetId: e.targetId,
          targetName: e.targetName || '',
          changes: e.changes || {},
        }))
      : [],
  };
}

/**
 * Build EditSuggestion objects by comparing AI-proposed changes against current data.
 * Supports both "edit" (modify existing) and "add" (create new) actions.
 */
export function buildSuggestions(
  edits: AIEditInstruction[],
  ctx: EditContext
): EditSuggestion[] {
  const results: EditSuggestion[] = [];

  for (const edit of edits) {
    const action: EditAction = edit.action || 'edit';
    const currentData = resolveCurrentData(edit.targetType, edit.targetId, ctx);

    if (action === 'add') {
      const changes: EditChange[] = [];
      for (const [field, newValue] of Object.entries(edit.changes)) {
        if (newValue !== undefined && newValue !== null && newValue !== '') {
          changes.push({ field, before: undefined, after: newValue });
        }
      }
      if (changes.length === 0) continue;

      results.push({
        id: nanoid(),
        action: 'add',
        targetType: edit.targetType,
        targetId: edit.targetId || `new_${nanoid(8)}`,
        targetName: edit.targetName || (edit.changes.name as string) || '新项目',
        changes,
        applied: false,
      });
    } else {
      if (!currentData) continue;

      const changes: EditChange[] = [];
      for (const [field, newValue] of Object.entries(edit.changes)) {
        const oldValue = (currentData as any)[field];
        if (oldValue !== newValue) {
          changes.push({ field, before: oldValue, after: newValue });
        }
      }
      if (changes.length === 0) continue;

      results.push({
        id: nanoid(),
        action: 'edit',
        targetType: edit.targetType,
        targetId: edit.targetId,
        targetName: edit.targetName || (currentData as any).name || edit.targetId,
        changes,
        applied: false,
      });
    }
  }

  return results;
}

function resolveCurrentData(
  type: string,
  id: string,
  ctx: EditContext
): Record<string, unknown> | null {
  switch (type) {
    case 'character':
      return (ctx.characters.find((c) => c.id === id) || null) as any;
    case 'scene':
      return (ctx.scenes.find((s) => s.id === id) || null) as any;
    case 'episode':
      return (ctx.episodes.find((e) => e.id === id) || null) as any;
    case 'shot':
      return (ctx.shots.find((s) => s.id === id) || null) as any;
    default:
      return null;
  }
}

/**
 * Resolve the active projectId from projectStore (primary) + scriptStore (fallback).
 */
function getActiveProjectId(): string | null {
  const pid = useProjectStore.getState().activeProjectId;
  if (pid) return pid;
  return useScriptStore.getState().activeProjectId;
}

export interface ApplyResult {
  success: boolean;
  snapshot?: EditSnapshot;
}

/**
 * Apply a single edit suggestion to the corresponding stores.
 * Returns a snapshot that can be used to revert the change.
 */
export function applySuggestion(suggestion: EditSuggestion): ApplyResult {
  const projectId = getActiveProjectId();
  if (!projectId) {
    console.warn('[EditRouter] No active projectId found in any store');
    return { success: false };
  }

  const fields: Record<string, unknown> = {};
  for (const change of suggestion.changes) {
    fields[change.field] = change.after;
  }

  try {
    if (suggestion.action === 'add') {
      return applyAddSuggestion(suggestion.targetType, fields, projectId);
    }
    return applyEditSuggestion(suggestion, fields, projectId);
  } catch (err) {
    console.error('[EditRouter] Failed to apply suggestion:', err);
    return { success: false };
  }
}

/**
 * Revert a previously applied suggestion using its snapshot.
 */
export function revertSuggestion(snapshot: EditSnapshot): boolean {
  try {
    if (snapshot.action === 'edit') {
      return revertEditSnapshot(snapshot);
    }
    return revertAddSnapshot(snapshot);
  } catch (err) {
    console.error('[EditRouter] Failed to revert suggestion:', err);
    return false;
  }
}

function revertEditSnapshot(snapshot: EditSnapshot): boolean {
  if (!snapshot.previousData) return false;
  const { projectId, targetType, targetId, previousData } = snapshot;
  const store = useScriptStore.getState();

  switch (targetType) {
    case 'character':
      store.updateCharacter(projectId, targetId, previousData as any);
      syncCharacterToLibrary(targetId, previousData, projectId);
      return true;
    case 'scene':
      store.updateScene(projectId, targetId, previousData as any);
      syncSceneToLibrary(targetId, previousData, projectId);
      return true;
    case 'episode':
      store.updateEpisode(projectId, targetId, previousData as any);
      return true;
    case 'shot':
      store.updateShot(projectId, targetId, previousData as any);
      return true;
    default:
      return false;
  }
}

function revertAddSnapshot(snapshot: EditSnapshot): boolean {
  if (!snapshot.addedIds) return false;
  const { projectId, targetType, addedIds } = snapshot;
  const scriptStore = useScriptStore.getState();

  switch (targetType) {
    case 'character': {
      scriptStore.deleteCharacter(projectId, addedIds.scriptId);
      if (addedIds.libraryId) {
        useCharacterLibraryStore.getState().deleteCharacter(addedIds.libraryId);
      }
      return true;
    }
    case 'scene': {
      scriptStore.deleteScene(projectId, addedIds.scriptId);
      if (addedIds.libraryId) {
        useSceneStore.getState().deleteScene(addedIds.libraryId);
      }
      return true;
    }
    case 'episode': {
      scriptStore.deleteEpisode(projectId, addedIds.scriptId);
      return true;
    }
    default:
      return false;
  }
}

function captureEditPreviousData(
  suggestion: EditSuggestion,
  projectId: string
): Record<string, unknown> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  const data: Record<string, unknown> = {};

  let entity: Record<string, unknown> | null = null;
  switch (suggestion.targetType) {
    case 'character':
      entity = (project?.scriptData?.characters.find((c) => c.id === suggestion.targetId) || null) as any;
      break;
    case 'scene':
      entity = (project?.scriptData?.scenes.find((s) => s.id === suggestion.targetId) || null) as any;
      break;
    case 'episode':
      entity = (project?.scriptData?.episodes.find((e) => e.id === suggestion.targetId) || null) as any;
      break;
    case 'shot':
      entity = (project?.shots?.find((s) => s.id === suggestion.targetId) || null) as any;
      break;
  }

  if (entity) {
    for (const change of suggestion.changes) {
      data[change.field] = entity[change.field];
    }
  }
  return data;
}

function applyEditSuggestion(
  suggestion: EditSuggestion,
  updates: Record<string, unknown>,
  projectId: string
): ApplyResult {
  const previousData = captureEditPreviousData(suggestion, projectId);
  const store = useScriptStore.getState();

  const snapshot: EditSnapshot = {
    action: 'edit',
    targetType: suggestion.targetType,
    targetId: suggestion.targetId,
    projectId,
    previousData,
  };

  switch (suggestion.targetType) {
    case 'character': {
      store.updateCharacter(projectId, suggestion.targetId, updates as any);
      syncCharacterToLibrary(suggestion.targetId, updates, projectId);
      console.log('[EditRouter] Character updated:', suggestion.targetId, 'project:', projectId);
      return { success: true, snapshot };
    }
    case 'scene': {
      store.updateScene(projectId, suggestion.targetId, updates as any);
      syncSceneToLibrary(suggestion.targetId, updates, projectId);
      console.log('[EditRouter] Scene updated:', suggestion.targetId, 'project:', projectId);
      return { success: true, snapshot };
    }
    case 'episode': {
      store.updateEpisode(projectId, suggestion.targetId, updates as any);
      console.log('[EditRouter] Episode updated:', suggestion.targetId, 'project:', projectId);
      return { success: true, snapshot };
    }
    case 'shot': {
      store.updateShot(projectId, suggestion.targetId, updates as any);
      console.log('[EditRouter] Shot updated:', suggestion.targetId, 'project:', projectId);
      return { success: true, snapshot };
    }
    default:
      return { success: false };
  }
}

const VALID_ROLE_TAGS = ['protagonist', 'supporting', 'minor', 'extra'] as const;
const CHINESE_TAG_MAP: Record<string, string> = {
  '主角': 'protagonist', '主人公': 'protagonist',
  '配角': 'supporting', '重要配角': 'supporting',
  '次要配角': 'minor', '次要角色': 'minor',
  '群演': 'extra', '龙套': 'extra', '路人': 'extra',
};

/**
 * Normalise tags from AI output: map Chinese labels to English,
 * and default to 'supporting' if no valid role tag is present.
 */
function normalizeCharacterTags(raw: string[] | undefined): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['supporting'];

  const mapped = raw.map((t) => CHINESE_TAG_MAP[t] || t);
  const hasRoleTag = mapped.some((t) => (VALID_ROLE_TAGS as readonly string[]).includes(t));
  if (!hasRoleTag) {
    mapped.push('supporting');
  }
  return mapped;
}

/**
 * Ensure scriptData exists for the project; initialise an empty one if needed
 * so that characters/scenes/episodes can be added even before a script is parsed.
 */
function ensureScriptData(projectId: string): void {
  const store = useScriptStore.getState();
  store.ensureProject(projectId);
  const project = useScriptStore.getState().projects[projectId];
  if (!project?.scriptData) {
    store.setScriptData(projectId, {
      title: '',
      language: '中文',
      characters: [],
      scenes: [],
      episodes: [],
      storyParagraphs: [],
    });
  }
}

function applyAddSuggestion(
  targetType: string,
  fields: Record<string, unknown>,
  projectId: string
): ApplyResult {
  ensureScriptData(projectId);

  const projectName = useProjectStore.getState().projects.find(
    (p) => p.id === projectId
  )?.name || '项目';

  switch (targetType) {
    case 'character': {
      const tags = normalizeCharacterTags(fields.tags as string[] | undefined);

      const charStore = useCharacterLibraryStore.getState();
      const folderId = charStore.getOrCreateProjectFolder(projectId, projectName);

      const libraryId = charStore.addCharacter({
        name: (fields.name as string) || '新角色',
        description: (fields.appearance as string) || '',
        visualTraits: '',
        projectId,
        folderId,
        gender: fields.gender as string,
        age: fields.age as string,
        personality: fields.personality as string,
        role: fields.role as string,
        traits: fields.traits as string,
        skills: fields.skills as string,
        keyActions: fields.keyActions as string,
        appearance: fields.appearance as string,
        relationships: fields.relationships as string,
        tags,
        notes: fields.notes as string,
        views: [],
      });

      const freshState = useScriptStore.getState();
      const scriptProject = freshState.projects[projectId];
      const newId = `char_${Date.now()}`;
      const character: ScriptCharacter = {
        id: newId,
        name: (fields.name as string) || '新角色',
        gender: fields.gender as string,
        age: fields.age as string,
        personality: fields.personality as string,
        role: fields.role as string,
        traits: fields.traits as string,
        skills: fields.skills as string,
        keyActions: fields.keyActions as string,
        appearance: fields.appearance as string,
        relationships: fields.relationships as string,
        tags,
        notes: fields.notes as string,
        characterLibraryId: libraryId,
      } as any;
      freshState.addCharacter(projectId, character);
      freshState.setMappings(projectId, {
        characterIdMap: {
          ...scriptProject.characterIdMap,
          [newId]: libraryId,
        },
      });

      console.log('[EditRouter] Character added to script store:', newId, '-> library:', libraryId, 'project:', projectId);
      return {
        success: true,
        snapshot: {
          action: 'add',
          targetType: 'character',
          targetId: newId,
          projectId,
          addedIds: { scriptId: newId, libraryId },
        },
      };
    }
    case 'scene': {
      const sceneStore = useSceneStore.getState();
      const folderId = sceneStore.getOrCreateProjectFolder(projectId, projectName);

      const libraryId = sceneStore.addScene({
        name: (fields.name as string) || '新场景',
        location: (fields.location as string) || '',
        time: (fields.time as string) || 'day',
        atmosphere: (fields.atmosphere as string) || '',
        projectId,
        folderId,
        visualPrompt: fields.visualPrompt as string,
        tags: fields.tags as string[],
        notes: fields.notes as string,
      });

      const freshState = useScriptStore.getState();
      const scriptProject = freshState.projects[projectId];
      const newId = `scene_${Date.now()}`;
      const scene: ScriptScene = {
        id: newId,
        name: (fields.name as string) || '新场景',
        location: (fields.location as string) || '',
        time: (fields.time as string) || 'day',
        atmosphere: (fields.atmosphere as string) || '',
        visualPrompt: fields.visualPrompt as string,
        tags: fields.tags as string[],
        notes: fields.notes as string,
        sceneLibraryId: libraryId,
        architectureStyle: fields.architectureStyle as string,
        lightingDesign: fields.lightingDesign as string,
        colorPalette: fields.colorPalette as string,
      };
      freshState.addScene(projectId, scene);
      freshState.setMappings(projectId, {
        sceneIdMap: {
          ...scriptProject.sceneIdMap,
          [newId]: libraryId,
        },
      });

      console.log('[EditRouter] Scene added to script store:', newId, '-> library:', libraryId, 'project:', projectId);
      return {
        success: true,
        snapshot: {
          action: 'add',
          targetType: 'scene',
          targetId: newId,
          projectId,
          addedIds: { scriptId: newId, libraryId },
        },
      };
    }
    case 'episode': {
      ensureScriptData(projectId);
      const freshState = useScriptStore.getState();
      const scriptProject = freshState.projects[projectId];
      const existingEps = scriptProject?.scriptData?.episodes || [];
      const newIndex = existingEps.length + 1;
      const newId = `ep_${Date.now()}`;
      const episode: Episode = {
        id: newId,
        index: newIndex,
        title: (fields.title as string) || `第${newIndex}集`,
        description: fields.description as string,
        sceneIds: [],
      };
      freshState.addEpisode(projectId, episode);
      console.log('[EditRouter] Episode added:', newId, 'project:', projectId);
      return {
        success: true,
        snapshot: {
          action: 'add',
          targetType: 'episode',
          targetId: newId,
          projectId,
          addedIds: { scriptId: newId },
        },
      };
    }
    default:
      return { success: false };
  }
}

function syncCharacterToLibrary(
  scriptCharId: string,
  updates: Record<string, unknown>,
  projectId: string
) {
  const scriptStore = useScriptStore.getState();
  const scriptProject = scriptStore.projects[projectId];
  if (!scriptProject?.scriptData) return;

  const scriptChar = scriptProject.scriptData.characters.find((c) => c.id === scriptCharId);
  const libraryId = scriptChar?.characterLibraryId ||
    scriptProject.characterIdMap[scriptCharId];
  if (!libraryId) return;

  const charStore = useCharacterLibraryStore.getState();
  const libChar = charStore.getCharacterById(libraryId);
  if (!libChar) return;

  charStore.updateCharacter(libraryId, updates as any);
}

function syncSceneToLibrary(
  scriptSceneId: string,
  updates: Record<string, unknown>,
  projectId: string
) {
  const scriptStore = useScriptStore.getState();
  const scriptProject = scriptStore.projects[projectId];
  if (!scriptProject?.scriptData) return;

  const scriptScene = scriptProject.scriptData.scenes.find((s) => s.id === scriptSceneId);
  const libraryId = scriptScene?.sceneLibraryId ||
    scriptProject.sceneIdMap[scriptSceneId];
  if (!libraryId) return;

  const sceneStore = useSceneStore.getState();
  const libScene = sceneStore.getSceneById(libraryId);
  if (!libScene) return;

  sceneStore.updateScene(libraryId, updates as any);
}
