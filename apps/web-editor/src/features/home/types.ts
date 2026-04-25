/**
 * Feature-local types for the home hub (Projects + Storyboard).
 */

/** Which tab is active in the home sidebar. */
export type HomeTab = 'projects' | 'storyboard';

/** Metadata for a single sidebar tab entry. */
export type HomeTabMeta = {
  id: HomeTab;
  label: string;
};

/**
 * Summary of a single project returned by GET /projects.
 * thumbnailUrl may be null — components MUST render a placeholder SVG in that case.
 */
export type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: string;
  thumbnailUrl: string | null;
};

/**
 * A single media preview item within a storyboard card.
 * thumbnailUrl may be null — components MUST render a placeholder SVG.
 */
export type MediaPreview = {
  fileId: string;
  type: string;
  thumbnailUrl: string | null;
};

/**
 * Summary of a single in-flight generation draft returned by GET /generation-drafts/cards.
 * mediaPreviews is capped at 3 by the backend.
 */
export type StoryboardCardSummary = {
  draftId: string;
  status: 'draft' | 'step2' | 'step3' | 'completed';
  textPreview: string | null;
  mediaPreviews: MediaPreview[];
  updatedAt: string;
};
