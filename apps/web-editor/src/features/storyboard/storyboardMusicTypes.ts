export type ElevenLabsCompositionPlanSection = {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number;
  lines: string[];
};

export type ElevenLabsCompositionPlan = {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: ElevenLabsCompositionPlanSection[];
};

export type StoryboardMusicSourceMode = 'existing' | 'generate_now' | 'generate_on_step3';

export type StoryboardMusicGenerationStatus = 'queued' | 'running' | 'ready' | 'failed';

export type StoryboardMusicBlock = {
  id: string;
  draftId: string;
  name: string;
  sourceMode: StoryboardMusicSourceMode;
  prompt: string | null;
  compositionPlan: ElevenLabsCompositionPlan | null;
  existingFileId: string | null;
  startSceneBlockId: string;
  endSceneBlockId: string;
  positionX: number;
  positionY: number;
  sortOrder: number;
  volume: number;
  fadeInS: number;
  fadeOutS: number;
  loopMode: 'loop' | 'trim';
  generationStatus: StoryboardMusicGenerationStatus | null;
  generationJobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoryboardMusicBlockSaveInput = Omit<
  StoryboardMusicBlock,
  | 'generationStatus'
  | 'generationJobId'
  | 'outputFileId'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
>;

export type StoryboardMusicBlockUpdatePayload = Partial<
  Omit<StoryboardMusicBlockSaveInput, 'id' | 'draftId'>
>;

export type StoryboardMusicResponse = {
  items: StoryboardMusicBlock[];
};
