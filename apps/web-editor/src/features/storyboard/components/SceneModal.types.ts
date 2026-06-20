/**
 * Shared types for SceneModal and its sub-components.
 * Kept in a separate file so SceneModal.mediaSection.tsx can import them
 * without creating a circular dependency.
 */

import type { AssetKind } from '@/features/generate-wizard/types';

import type { StoryboardBlock, BlockMediaMotionGraphicSnapshot } from '../types';

/** Block-media kinds: the asset kinds plus the frozen motion-graphic snapshot. */
export type BlockMediaKind = AssetKind | 'motion_graphic';

/** A single media item displayed and edited within SceneModal. */
export type ModalMediaItem = {
  fileId: string;
  mediaType: BlockMediaKind;
  filename: string;
  sortOrder: number;
  /** Present only for motion_graphic items — the frozen snapshot to preview. */
  motionGraphic?: BlockMediaMotionGraphicSnapshot;
};

/** Determines whether SceneModal is editing a canvas block or a library template. */
export type SceneModalMode = 'block' | 'template';

/** Payload emitted by SceneModal when the user saves. */
export type SceneModalSavePayload = {
  name: string;
  prompt: string;
  videoPrompt: string | null;
  durationS: number;
  style: string | null;
  mediaItems: ModalMediaItem[];
};

/** Props for SceneModal when mode = 'block'. */
export interface SceneModalBlockProps {
  mode: 'block';
  block: StoryboardBlock;
  onSave: (blockId: string, patch: SceneModalSavePayload) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  /**
   * When provided, the asset picker modals inside SceneModal will show an
   * "Upload new file" button that links the uploaded file to this draft.
   * Optional — callers that do not have a draftId (e.g. tests, template mode)
   * may omit this prop; upload affordance is simply hidden in that case.
   */
  uploadDraftId?: string;
}

/** Props for SceneModal when mode = 'template'. */
export interface SceneModalTemplateProps {
  mode: 'template';
  /** If undefined, SceneModal is creating a new template; otherwise editing one. */
  templateId?: string;
  initialValues?: Partial<SceneModalSavePayload>;
  onSave: (payload: SceneModalSavePayload) => void;
  onClose: () => void;
}

/** Union of both prop shapes. */
export type SceneModalProps = SceneModalBlockProps | SceneModalTemplateProps;
