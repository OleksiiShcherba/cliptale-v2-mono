/**
 * renderPromptDocText — converts a PromptDoc to a human-readable string.
 *
 * Text blocks are joined as-is. Media-ref blocks are rendered as
 * `[<mediaType>: <label>]` so the diff view shows a meaningful label
 * instead of a raw UUID.
 *
 * §5: no logic in `.tsx` — this helper lives in its own `.ts` file.
 * §14: imports only from the feature-local types entry point.
 */

import type { PromptDoc, PromptBlock } from '@/features/generate-wizard/types';

/**
 * Converts a single PromptBlock to its string representation.
 *
 * @param block - A text or media-ref block from a PromptDoc.
 * @returns A plain-text string fragment.
 */
function renderBlock(block: PromptBlock): string {
  if (block.type === 'text') {
    return block.value;
  }
  // media-ref → "[video: My Clip]" style inline label
  return `[${block.mediaType}: ${block.label}]`;
}

/**
 * Converts a PromptDoc to a single human-readable string by joining all blocks.
 *
 * Empty documents (no blocks, or blocks containing only empty text) return
 * an empty string. The caller decides how to display that case.
 *
 * @param doc - The PromptDoc to render.
 * @returns A concatenated plain-text representation of the prompt.
 */
export function renderPromptDocText(doc: PromptDoc): string {
  return doc.blocks.map(renderBlock).join('');
}
