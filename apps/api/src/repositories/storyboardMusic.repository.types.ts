import type { RowDataPacket } from 'mysql2/promise';

export type ElevenLabsCompositionPlan = Record<string, unknown>;
export type StoryboardMusicSourceMode = 'existing' | 'generate_now' | 'generate_on_step3';
export type StoryboardMusicGenerationStatus = 'queued' | 'running' | 'ready' | 'failed';
export type StoryboardMusicLoopMode = 'loop' | 'trim';

export type StoryboardMusicBlockInsert = {
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
  loopMode: StoryboardMusicLoopMode;
};

export type StoryboardMusicBlock = StoryboardMusicBlockInsert & {
  generationStatus: StoryboardMusicGenerationStatus | null;
  generationJobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoryboardMusicGenerationJob = {
  id: string;
  draftId: string;
  musicBlockId: string;
  aiJobId: string;
  status: StoryboardMusicGenerationStatus;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MusicBlockRow = RowDataPacket & {
  id: string;
  draft_id: string;
  name: string;
  source_mode: StoryboardMusicSourceMode;
  prompt: string | null;
  composition_plan_json: unknown;
  existing_file_id: string | null;
  start_scene_block_id: string;
  end_scene_block_id: string;
  position_x: number;
  position_y: number;
  sort_order: number;
  volume: string | number;
  fade_in_s: string | number;
  fade_out_s: string | number;
  loop_mode: StoryboardMusicLoopMode;
  generation_status: StoryboardMusicGenerationStatus | null;
  generation_job_id: string | null;
  output_file_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MusicGenerationJobRow = RowDataPacket & {
  id: string;
  draft_id: string;
  music_block_id: string;
  ai_job_id: string;
  status: StoryboardMusicGenerationStatus;
  output_file_id: string | null;
  error_message: string | null;
  active_lock: number | null;
  created_at: Date;
  updated_at: Date;
};

function parseCompositionPlan(value: unknown): ElevenLabsCompositionPlan | null {
  if (value === null || value === undefined) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as ElevenLabsCompositionPlan;
}

export function mapMusicBlockRow(row: MusicBlockRow): StoryboardMusicBlock {
  return {
    id: row.id,
    draftId: row.draft_id,
    name: row.name,
    sourceMode: row.source_mode,
    prompt: row.prompt,
    compositionPlan: parseCompositionPlan(row.composition_plan_json),
    existingFileId: row.existing_file_id,
    startSceneBlockId: row.start_scene_block_id,
    endSceneBlockId: row.end_scene_block_id,
    positionX: row.position_x,
    positionY: row.position_y,
    sortOrder: row.sort_order,
    volume: Number(row.volume),
    fadeInS: Number(row.fade_in_s),
    fadeOutS: Number(row.fade_out_s),
    loopMode: row.loop_mode,
    generationStatus: row.generation_status,
    generationJobId: row.generation_job_id,
    outputFileId: row.output_file_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMusicGenerationJobRow(
  row: MusicGenerationJobRow,
): StoryboardMusicGenerationJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    musicBlockId: row.music_block_id,
    aiJobId: row.ai_job_id,
    status: row.status,
    outputFileId: row.output_file_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
