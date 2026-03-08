/**
 * useDirectoryWriteback - 监听 scriptStore 变更，自动将数据写回关联的项目目录。
 * 使用 debounce 避免频繁写入，并跳过由目录同步触发的变更（防止循环）。
 */
import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useScriptStore } from '@/stores/script-store';

let writingBack = false;

/** 供 useDirectorySync 调用，在从目录同步数据期间禁止回写 */
export function setWritebackPaused(paused: boolean) {
  writingBack = paused;
}

export function useDirectoryWriteback() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const linkedDir = useProjectStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId)?.linkedDirectory
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenAtRef = useRef<number>(0);

  const scriptUpdatedAt = useScriptStore((s) => {
    if (!activeProjectId) return 0;
    return s.projects[activeProjectId]?.updatedAt || 0;
  });

  useEffect(() => {
    if (!linkedDir || !activeProjectId || !scriptUpdatedAt) return;
    if (writingBack) return;
    if (scriptUpdatedAt <= lastWrittenAtRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (writingBack) return;
      const fs = (window as any).directoryFs;
      if (!fs?.writeFile) return;

      const scriptStore = useScriptStore.getState();
      const project = scriptStore.projects[activeProjectId];
      if (!project) return;

      try {
        await writeProjectJson(fs, linkedDir, project, activeProjectId);
        await writeCharacters(fs, linkedDir, project);
        await writeScenes(fs, linkedDir, project);
        await writeEpisodes(fs, linkedDir, project);
        await writeShots(fs, linkedDir, project);
        lastWrittenAtRef.current = scriptUpdatedAt;
      } catch (err) {
        console.warn('[DirectoryWriteback] Failed:', err);
      }
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [linkedDir, activeProjectId, scriptUpdatedAt]);
}

async function writeProjectJson(fs: any, dir: string, project: any, _projectId: string) {
  const bg = project.projectBackground || {};
  const sd = project.scriptData;
  const json = {
    name: bg.title || sd?.title || '项目',
    title: sd?.title,
    genre: sd?.genre || bg.genre,
    era: bg.era,
    language: sd?.language || '中文',
    outline: bg.outline,
    characterBios: bg.characterBios,
    worldSetting: bg.worldSetting,
    themes: bg.themes,
    promptLanguage: project.promptLanguage,
    totalEpisodes: bg.totalEpisodes,
    styleId: project.styleId,
    targetDuration: sd?.targetDuration || project.targetDuration,
  };
  await fs.writeFile(`${dir}/project.json`, JSON.stringify(json, null, 2));
}

async function writeCharacters(fs: any, dir: string, project: any) {
  const chars = project.scriptData?.characters;
  if (!chars) return;
  for (const c of chars) {
    const json: Record<string, unknown> = {
      id: c.id, name: c.name, gender: c.gender, age: c.age,
      personality: c.personality, role: c.role, traits: c.traits,
      skills: c.skills, keyActions: c.keyActions, appearance: c.appearance,
      relationships: c.relationships, tags: c.tags || ['supporting'],
      notes: c.notes, visualPromptEn: c.visualPromptEn, visualPromptZh: c.visualPromptZh,
    };
    if (c.baseCharacterId) json.baseCharacterId = c.baseCharacterId;
    if (c.stageInfo) json.stageInfo = c.stageInfo;
    if (c.stageCharacterIds) json.stageCharacterIds = c.stageCharacterIds;
    await fs.writeFile(`${dir}/characters/${c.id}.json`, JSON.stringify(json, null, 2));
  }
}

async function writeScenes(fs: any, dir: string, project: any) {
  const scenes = project.scriptData?.scenes;
  if (!scenes) return;
  for (const s of scenes) {
    const json = {
      id: s.id, name: s.name, location: s.location, time: s.time,
      atmosphere: s.atmosphere, visualPrompt: s.visualPrompt,
      tags: s.tags, notes: s.notes, architectureStyle: s.architectureStyle,
      lightingDesign: s.lightingDesign, colorPalette: s.colorPalette,
      keyProps: s.keyProps, spatialLayout: s.spatialLayout, eraDetails: s.eraDetails,
    };
    await fs.writeFile(`${dir}/scenes/${s.id}.json`, JSON.stringify(json, null, 2));
  }
}

async function writeEpisodes(fs: any, dir: string, project: any) {
  const episodes = project.scriptData?.episodes;
  if (!episodes) return;
  const rawScripts = project.episodeRawScripts || [];
  for (const ep of episodes) {
    const rawScript = rawScripts.find((r: any) => r.episodeIndex === ep.index);
    const json: Record<string, unknown> = {
      id: ep.id, index: ep.index, title: ep.title,
      description: ep.description, sceneIds: ep.sceneIds || [],
    };
    if (rawScript) {
      json.rawScript = {
        synopsis: rawScript.synopsis,
        keyEvents: rawScript.keyEvents,
        rawContent: rawScript.rawContent,
      };
    }
    await fs.writeFile(`${dir}/episodes/${ep.id}.json`, JSON.stringify(json, null, 2));
  }
}

async function writeShots(fs: any, dir: string, project: any) {
  const shots = project.shots;
  if (!shots) return;
  for (const s of shots) {
    const json: Record<string, unknown> = {
      id: s.id, index: s.index, episodeId: s.episodeId,
      sceneRefId: s.sceneRefId, actionSummary: s.actionSummary,
      dialogue: s.dialogue || '', characterIds: s.characterIds || [],
      characterNames: s.characterNames || [],
      characterVariations: s.characterVariations || {},
      shotSize: s.shotSize, duration: s.duration,
      cameraMovement: s.cameraMovement,
    };
    if (s.visualDescription) json.visualDescription = s.visualDescription;
    if (s.imagePrompt) json.imagePrompt = s.imagePrompt;
    if (s.imagePromptZh) json.imagePromptZh = s.imagePromptZh;
    if (s.videoPrompt) json.videoPrompt = s.videoPrompt;
    await fs.writeFile(`${dir}/shots/${s.id}.json`, JSON.stringify(json, null, 2));
  }
}
