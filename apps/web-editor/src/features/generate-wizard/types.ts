/**
 * Feature-local types for the generate-wizard feature.
 *
 * Re-exports `PromptDoc` and its block types from the schema package so that
 * wizard components depend on a single feature-local entry point.
 */

import type { PromptDoc, PromptBlock, TextBlock, MediaRefBlock } from '@ai-video-editor/project-schema';

export type { PromptDoc, PromptBlock, TextBlock, MediaRefBlock };

/** The three steps of the video generation wizard. */
export type WizardStep = 1 | 2 | 3;

/** Metadata for a single wizard step node. */
export type WizardStepMeta = {
  step: WizardStep;
  label: string;
};

/** The three media kinds returned by GET /assets. */
export type AssetKind = 'video' | 'image' | 'audio';

/** Summary of an asset as returned by GET /assets (wizard scope — no projectId). */
export type AssetSummary = {
  id: string;
  type: AssetKind;
  label: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
};

/** Usage totals returned in the GET /assets envelope. */
export type AssetTotals = {
  count: number;
  bytesUsed: number;
};

/** Paginated response envelope from GET /assets. */
export type AssetListResponse = {
  items: AssetSummary[];
  nextCursor: string | null;
  totals: AssetTotals;
};

/** Save lifecycle state for the generation draft autosave hook. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** AI Enhance lifecycle state exposed by `useEnhancePrompt`. */
export type EnhanceStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

/** Shape of a generation draft record returned by POST/PUT /generation-drafts. */
export type GenerationDraft = {
  id: string;
  userId: string;
  promptDoc: PromptDoc;
  createdAt: string;
  updatedAt: string;
};
