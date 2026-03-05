import { useProjectStore } from "@/stores/project-store";
import { useScriptStore } from "@/stores/script-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useSceneStore } from "@/stores/scene-store";
import type {
  ScriptData,
  ScriptCharacter,
  ScriptScene,
  Episode,
  Shot,
  ProjectBackground,
  EpisodeRawScript,
} from "@/types/script";

interface MoyinImportData {
  version: number;
  exportedAt: string;
  project: {
    name: string;
    title?: string;
    genre?: string;
    era?: string;
    language?: string;
    targetDuration?: string;
    styleId?: string;
    outline?: string;
    characterBios?: string;
    worldSetting?: string;
    themes?: string[];
    promptLanguage?: "zh" | "en" | "zh+en";
    totalEpisodes?: number;
    timelineSetting?: string;
    storyStartYear?: number;
    storyEndYear?: number;
  };
  characters: ImportCharacter[];
  scenes: ImportScene[];
  episodes: {
    id: string;
    index: number;
    title: string;
    description?: string;
    sceneIds: string[];
  }[];
  episodeRawScripts: {
    episodeIndex: number;
    title: string;
    synopsis?: string;
    keyEvents?: string[];
    rawContent: string;
    scenes: any[];
    shotGenerationStatus: string;
  }[];
  shots: ImportShot[];
}

interface ImportCharacter {
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
  relationships?: string;
  tags?: string[];
  notes?: string;
  baseCharacterId?: string;
  stageCharacterIds?: string[];
  stageInfo?: { stageName: string; episodeRange: [number, number]; ageDescription?: string };
  visualPromptEn?: string;
  visualPromptZh?: string;
}

interface ImportScene {
  id: string;
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  tags?: string[];
  notes?: string;
  architectureStyle?: string;
  lightingDesign?: string;
  colorPalette?: string;
  keyProps?: string[];
  spatialLayout?: string;
  eraDetails?: string;
}

interface ImportShot {
  id: string;
  index: number;
  episodeId?: string;
  sceneRefId: string;
  actionSummary: string;
  visualDescription?: string;
  characterIds: string[];
  characterNames?: string[];
  characterVariations: Record<string, string>;
  shotSize?: string;
  duration?: number;
  cameraMovement?: string;
  dialogue?: string;
  ambientSound?: string;
  soundEffect?: string;
  imagePrompt?: string;
  imagePromptZh?: string;
  videoPrompt?: string;
  videoPromptZh?: string;
  visualPrompt?: string;
  narrativeFunction?: string;
  shotPurpose?: string;
  visualFocus?: string;
  characterBlocking?: string;
  [key: string]: unknown;
}

export interface ImportResult {
  projectId: string;
  projectName: string;
  characterCount: number;
  sceneCount: number;
  episodeCount: number;
  shotCount: number;
}

export function validateImportData(raw: unknown): MoyinImportData {
  const data = raw as any;
  if (!data || typeof data !== "object") throw new Error("Invalid import data: not an object");
  if (data.version !== 1) throw new Error(`Unsupported import version: ${data.version}`);
  if (!data.project?.name) throw new Error("Missing project name");
  if (!Array.isArray(data.characters)) throw new Error("Missing characters array");
  if (!Array.isArray(data.scenes)) throw new Error("Missing scenes array");
  if (!Array.isArray(data.episodes)) throw new Error("Missing episodes array");
  if (!Array.isArray(data.shots)) throw new Error("Missing shots array");
  return data as MoyinImportData;
}

export function importMoyinProject(data: MoyinImportData): ImportResult {
  const projectStore = useProjectStore.getState();
  const scriptStore = useScriptStore.getState();
  const charStore = useCharacterLibraryStore.getState();
  const sceneStore = useSceneStore.getState();

  // 1. Create project
  const project = projectStore.createProject(data.project.name);
  const projectId = project.id;

  // 2. Ensure script project exists
  scriptStore.ensureProject(projectId);

  // 3. Set project background
  const bg: ProjectBackground = {
    title: data.project.title || data.project.name,
    genre: data.project.genre,
    era: data.project.era,
    timelineSetting: data.project.timelineSetting,
    storyStartYear: data.project.storyStartYear,
    storyEndYear: data.project.storyEndYear,
    totalEpisodes: data.project.totalEpisodes,
    outline: data.project.outline || "",
    characterBios: data.project.characterBios || "",
    worldSetting: data.project.worldSetting,
    themes: data.project.themes,
  };
  scriptStore.setProjectBackground(projectId, bg);

  // 4. Build characters for scriptData and character library
  const characterIdMap: Record<string, string> = {};
  const folderId = charStore.getOrCreateProjectFolder(projectId, data.project.name);

  const scriptCharacters: ScriptCharacter[] = data.characters.map((c) => {
    const libId = charStore.addCharacter({
      name: c.name,
      description: c.appearance || "",
      visualTraits: c.visualPromptEn || "",
      projectId,
      folderId,
      gender: c.gender,
      age: c.age,
      personality: c.personality,
      role: c.role,
      traits: c.traits,
      skills: c.skills,
      keyActions: c.keyActions,
      appearance: c.appearance,
      relationships: c.relationships,
      tags: c.tags,
      notes: c.notes,
      views: [],
    });

    characterIdMap[c.id] = libId;

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
      relationships: c.relationships,
      tags: c.tags,
      notes: c.notes,
      baseCharacterId: c.baseCharacterId,
      stageInfo: c.stageInfo,
      stageCharacterIds: c.stageCharacterIds,
      visualPromptEn: c.visualPromptEn,
      visualPromptZh: c.visualPromptZh,
      characterLibraryId: libId,
    } as ScriptCharacter;
  });

  // 5. Build scenes for scriptData and scene store
  const sceneIdMap: Record<string, string> = {};
  const sceneFolderId = sceneStore.getOrCreateProjectFolder(projectId, data.project.name);

  const scriptScenes: ScriptScene[] = data.scenes.map((s) => {
    const libId = sceneStore.addScene({
      name: s.name || s.location,
      location: s.location,
      time: s.time,
      atmosphere: s.atmosphere,
      projectId,
      folderId: sceneFolderId,
      visualPrompt: s.visualPrompt,
      tags: s.tags,
      notes: s.notes,
    });

    sceneIdMap[s.id] = libId;

    return {
      id: s.id,
      name: s.name,
      location: s.location,
      time: s.time,
      atmosphere: s.atmosphere,
      visualPrompt: s.visualPrompt,
      tags: s.tags,
      notes: s.notes,
      architectureStyle: s.architectureStyle,
      lightingDesign: s.lightingDesign,
      colorPalette: s.colorPalette,
      keyProps: s.keyProps,
      spatialLayout: s.spatialLayout,
      eraDetails: s.eraDetails,
      sceneLibraryId: libId,
    } as ScriptScene;
  });

  // 6. Build episodes — derive sceneIds from shots if missing
  const episodes: Episode[] = data.episodes.map((ep) => {
    let sceneIds = ep.sceneIds;
    if (!sceneIds || sceneIds.length === 0) {
      sceneIds = [
        ...new Set(
          data.shots
            .filter((s) => s.episodeId === ep.id)
            .map((s) => s.sceneRefId)
            .filter(Boolean)
        ),
      ];
    }
    return {
      id: ep.id,
      index: ep.index,
      title: ep.title,
      description: ep.description,
      sceneIds,
    };
  });

  // 7. Set scriptData
  const scriptData: ScriptData = {
    title: data.project.title || data.project.name,
    genre: data.project.genre,
    language: data.project.language || "中文",
    targetDuration: data.project.targetDuration,
    characters: scriptCharacters,
    scenes: scriptScenes,
    episodes,
    storyParagraphs: [],
  };
  scriptStore.setScriptData(projectId, scriptData);

  // 8. Set shots
  const shots: Shot[] = data.shots.map((s, idx) => ({
    id: s.id,
    index: s.index ?? idx + 1,
    episodeId: s.episodeId,
    sceneRefId: s.sceneRefId,
    actionSummary: s.actionSummary,
    visualDescription: s.visualDescription,
    characterIds: s.characterIds || [],
    characterNames: s.characterNames,
    characterVariations: s.characterVariations || {},
    shotSize: s.shotSize,
    duration: s.duration,
    cameraMovement: s.cameraMovement,
    dialogue: s.dialogue,
    ambientSound: s.ambientSound,
    soundEffect: s.soundEffect,
    imagePrompt: s.imagePrompt,
    imagePromptZh: s.imagePromptZh,
    videoPrompt: s.videoPrompt,
    videoPromptZh: s.videoPromptZh,
    visualPrompt: s.visualPrompt,
    narrativeFunction: s.narrativeFunction,
    shotPurpose: s.shotPurpose,
    visualFocus: s.visualFocus,
    characterBlocking: s.characterBlocking,
    imageStatus: "idle" as const,
    imageProgress: 0,
    videoStatus: "idle" as const,
    videoProgress: 0,
  }));
  scriptStore.setShots(projectId, shots);

  // 9. Set episode raw scripts
  if (data.episodeRawScripts?.length > 0) {
    const rawScripts: EpisodeRawScript[] = data.episodeRawScripts.map((er) => ({
      episodeIndex: er.episodeIndex,
      title: er.title,
      synopsis: er.synopsis,
      keyEvents: er.keyEvents,
      rawContent: er.rawContent,
      scenes: er.scenes || [],
      shotGenerationStatus: (er.shotGenerationStatus as any) || "idle",
    }));
    scriptStore.setEpisodeRawScripts(projectId, rawScripts);
  }

  // 10. Set ID mappings
  scriptStore.setMappings(projectId, { characterIdMap, sceneIdMap });

  // 11. Set style and other config
  if (data.project.styleId) {
    scriptStore.setStyleId(projectId, data.project.styleId);
  }
  if (data.project.targetDuration) {
    scriptStore.setTargetDuration(projectId, data.project.targetDuration);
  }
  if (data.project.language) {
    scriptStore.setLanguage(projectId, data.project.language);
  }
  if (data.project.promptLanguage) {
    scriptStore.setPromptLanguage(projectId, data.project.promptLanguage);
  }

  return {
    projectId,
    projectName: data.project.name,
    characterCount: scriptCharacters.length,
    sceneCount: scriptScenes.length,
    episodeCount: episodes.length,
    shotCount: shots.length,
  };
}
