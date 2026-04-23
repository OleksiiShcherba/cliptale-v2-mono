/**
 * Feature-local types for the storyboard feature.
 *
 * Covers the page shell, sidebar state, and canvas primitives.
 */

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

/** Shape returned by GET /storyboards/:draftId and POST /storyboards/:draftId/initialize. */
export type StoryboardState = {
  blocks: StoryboardBlock[];
  edges: StoryboardEdge[];
};

/** React Flow node data for a SCENE block. */
export type SceneBlockNodeData = {
  block: StoryboardBlock;
  onRemove: (nodeId: string) => void;
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
  media: SceneTemplateMedia[];
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
  media?: Array<{
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
  media?: Array<{
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
