/**
 * Shared test fixtures for EnhancePreviewModal tests.
 *
 * All fixtures import only from the feature-local types entry point (§14).
 */

import type { PromptDoc } from '@/features/generate-wizard/types';

// ---------------------------------------------------------------------------
// Sample PromptDoc instances
// ---------------------------------------------------------------------------

/** Minimal "before" prompt with text only. */
export const TEXT_ONLY_ORIGINAL: PromptDoc = {
  schemaVersion: 1,
  blocks: [
    { type: 'text', value: 'Create a video about space exploration.' },
  ],
};

/** Minimal "after" prompt — still text only, with enhanced content. */
export const TEXT_ONLY_PROPOSED: PromptDoc = {
  schemaVersion: 1,
  blocks: [
    {
      type: 'text',
      value:
        'Create a cinematic video showcasing the wonders of space exploration, from rocket launches to distant galaxies.',
    },
  ],
};

/** "Before" prompt that includes a media-ref chip. */
export const MEDIA_REF_ORIGINAL: PromptDoc = {
  schemaVersion: 1,
  blocks: [
    { type: 'text', value: 'Show this clip: ' },
    {
      type: 'media-ref',
      mediaType: 'video',
      fileId: '00000000-0000-0000-0000-000000000001',
      label: 'Rocket Launch',
    },
    { type: 'text', value: ' and then describe the mission.' },
  ],
};

/** "After" prompt that preserves the media-ref chip with enhanced surrounding text. */
export const MEDIA_REF_PROPOSED: PromptDoc = {
  schemaVersion: 1,
  blocks: [
    { type: 'text', value: 'Open with the dramatic launch sequence: ' },
    {
      type: 'media-ref',
      mediaType: 'video',
      fileId: '00000000-0000-0000-0000-000000000001',
      label: 'Rocket Launch',
    },
    {
      type: 'text',
      value:
        ' Then transition to an awe-inspiring narration of the interplanetary mission objectives.',
    },
  ],
};

/** Empty PromptDoc for edge-case tests. */
export const EMPTY_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [],
};
