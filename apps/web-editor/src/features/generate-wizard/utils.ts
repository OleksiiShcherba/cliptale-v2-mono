import type { DraftSettings, PromptDoc } from './types';

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  videoLengthSeconds: 30,
  aspectRatio: '16:9',
  styleKey: 'cinematic',
  modelPreference: null,
};

export function getDraftSettings(promptDoc: PromptDoc): DraftSettings {
  return { ...DEFAULT_DRAFT_SETTINGS, ...promptDoc.settings };
}

/**
 * Returns true when the doc has at least one text block with non-empty value
 * OR at least one media-ref block.
 *
 * Used to guard the Next button — disabled when hasAnyContent returns false.
 */
export function hasAnyContent(doc: PromptDoc): boolean {
  for (const block of doc.blocks) {
    if (block.type === 'media-ref') return true;
    if (block.type === 'text' && block.value.trim() !== '') return true;
  }
  return false;
}
