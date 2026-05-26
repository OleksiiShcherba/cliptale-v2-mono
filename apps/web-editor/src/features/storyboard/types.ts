/**
 * Feature-local types for the storyboard feature.
 *
 * Covers the page shell, sidebar state, and canvas primitives.
 */

import type {
  StoryboardMusicBlock,
  StoryboardMusicBlockSaveInput,
} from './storyboardMusicTypes';

/** The three sidebar tabs available on the StoryboardPage. */
export type StoryboardSidebarTab = 'storyboard' | 'library' | 'effects';

/** Autosave indicator state — wired in subtask 8; placeholder for now. */
export type StoryboardSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Canvas types ──────────────────────────────────────────────────────────────

/** Valid block_type values matching the storyboard_blocks ENUM. */
export type BlockType = 'start' | 'end' | 'scene';

/** A single media attachment on a storyboard block. */
export type BlockMediaItem = {
  id: string;
  fileId: string;
  mediaType: 'image' | 'video' | 'audio';
  sortOrder: number;
};

/** A fully-hydrated storyboard block returned from the API. */
export type StoryboardBlock = {
  id: string;
  draftId: string;
  blockType: BlockType;
  name: string | null;
  prompt: string | null;
  videoPrompt: string | null;
  durationS: number;
  positionX: number;
  positionY: number;
  sortOrder: number;
  style: string | null;
  createdAt: string;
  updatedAt: string;
  mediaItems: BlockMediaItem[];
};

/** A directed edge between two storyboard blocks. */
export type StoryboardEdge = {
  id: string;
  draftId: string;
  sourceBlockId: string;
  targetBlockId: string;
};

export type {
  ElevenLabsCompositionPlan,
  ElevenLabsCompositionPlanSection,
  StoryboardMusicBlock,
  StoryboardMusicBlockSaveInput,
  StoryboardMusicBlockUpdatePayload,
  StoryboardMusicGenerationStatus,
  StoryboardMusicResponse,
  StoryboardMusicSourceMode,
} from './storyboardMusicTypes';

/** Shape returned by GET /storyboards/:draftId and POST /storyboards/:draftId/initialize. */
export type StoryboardState = {
  blocks: StoryboardBlock[];
  edges: StoryboardEdge[];
  musicBlocks: StoryboardMusicBlock[];
};

/** PUT /storyboards/:draftId payload. musicBlocks is optional to preserve current music. */
export type StoryboardSavePayload = {
  blocks: StoryboardBlock[];
  edges: StoryboardEdge[];
  musicBlocks?: StoryboardMusicBlockSaveInput[];
};

/** Frontend-owned lifecycle for generating and applying a storyboard plan. */
export type StoryboardPlanGenerationStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'applying'
  | 'completed'
  | 'failed';

export type StoryboardIllustrationStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed';

export type StoryboardIllustrationStatusItem = {
  blockId: string;
  status: StoryboardIllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
};

export type StoryboardIllustrationReferenceStatus = {
  status: StoryboardIllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  sourceReferenceFileIds: string[];
  approvalStatus: 'pending' | 'approved';
  errorMessage: string | null;
};

export type StoryboardAutomationPhase =
  | 'idle'
  | 'planning'
  | 'creating_principal_image'
  | 'awaiting_principal_approval'
  | 'generating_scene_illustrations'
  | 'ready'
  | 'failed';

export type StoryboardAutomationStatus = {
  phase: StoryboardAutomationPhase;
  planningJobId: string | null;
  errorMessage: string | null;
};

export type StoryboardIllustrationStatusResponse = {
  automation: StoryboardAutomationStatus;
  reference: StoryboardIllustrationReferenceStatus;
  items: StoryboardIllustrationStatusItem[];
};

export type StoryboardVideoStatus = 'queued' | 'running' | 'ready' | 'failed';

export type StoryboardVideoStatusItem = {
  blockId: string;
  status: StoryboardVideoStatus;
  jobId: string | null;
  modelId: string | null;
  generateAudio: boolean;
  outputFileId: string | null;
  errorMessage: string | null;
};

export type StoryboardVideoStatusResponse = {
  items: StoryboardVideoStatusItem[];
};

export type StoryboardProjectAssemblyMode = 'images' | 'videos';

export type StoryboardProjectCreateResponse = {
  projectId: string;
  versionId: number;
};

export type StoryboardIllustrationLifecycleStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type StoryboardIllustrationLifecyclePhase =
  | 'idle'
  | 'reference'
  | 'scene'
  | 'completed'
  | 'failed';

/** React Flow node data for a SCENE block. */
export type SceneBlockNodeData = {
  block: StoryboardBlock;
  onRemove: (nodeId: string) => void;
  illustration?: StoryboardIllustrationStatusItem;
  onRetryIllustration?: (blockId: string) => void;
  musicCoverage?: {
    count: number;
    isHighlighted: boolean;
  };
  /** Optional callback fired when the user clicks the block to open SceneModal. */
  onEdit?: (nodeId: string) => void;
};

/** React Flow node data for storyboard background music blocks. */
export type MusicBlockNodeData = {
  musicBlock: StoryboardMusicBlock;
  rangeLabel: string;
  sourceLabel: string;
  statusLabel: string;
  isActive: boolean;
  onEdit: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
};

/** React Flow node data for START/END sentinel nodes. */
export type SentinelNodeData = {
  label: string;
};

// ── Scene Template types ───────────────────────────────────────────────────────

/** A single media attachment on a scene template. */
export type SceneTemplateMedia = {
  id: string;
  templateId: string;
  fileId: string;
  mediaType: 'image' | 'video' | 'audio';
  sortOrder: number;
};

/** A fully-hydrated scene template returned from the API. */
export type SceneTemplate = {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  durationS: number;
  style: string | null;
  mediaItems: SceneTemplateMedia[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

/** Payload for creating a new scene template. */
export type CreateSceneTemplatePayload = {
  name: string;
  prompt: string;
  durationS: number;
  style?: string;
  mediaItems?: Array<{
    fileId: string;
    mediaType: 'image' | 'video' | 'audio';
    sortOrder: number;
  }>;
};

/** Payload for updating an existing scene template (all fields optional). */
export type UpdateSceneTemplatePayload = {
  name?: string;
  prompt?: string;
  durationS?: number;
  style?: string;
  mediaItems?: Array<{
    fileId: string;
    mediaType: 'image' | 'video' | 'audio';
    sortOrder: number;
  }>;
};

/** Payload for adding a scene template to a storyboard draft. */
export type AddToStoryboardPayload = {
  templateId: string;
  draftId: string;
};
