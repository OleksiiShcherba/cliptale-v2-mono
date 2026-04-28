/**
 * Shared types for SceneModal and its sub-components.
 * Kept in a separate file so SceneModal.mediaSection.tsx can import them
 * without creating a circular dependency.
 */

import type { AssetKind } from '@/features/generate-wizard/types';

import type { StoryboardBlock } from '../types';

/** A single media item displayed and edited within SceneModal. */
export type ModalMediaItem = {
  fileId: string;
  mediaType: AssetKind;
  filename: string;
  sortOrder: number;
};

/** Determines whether SceneModal is editing a canvas block or a library template. */
export type SceneModalMode = 'block' | 'template';

/** Payload emitted by SceneModal when the user saves. */
export type SceneModalSavePayload = {
  name: string;
  prompt: string;
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
