/**
 * Pure `PromptDoc` mutation helpers — no DOM access.
 *
 * Extracted from `promptEditorDOM.ts` to keep that file under the §9.7 300-line
 * cap. These helpers are re-exported via `promptEditorDOM.ts` for backward
 * compatibility with existing import sites.
 */

import type { MediaRefBlock, PromptBlock, PromptDoc } from '@ai-video-editor/project-schema';

/**
 * Inserts `chip` at linear offset `offset` within `doc`. Splits the containing
 * text block when the offset falls inside one, and pads with empty text blocks
 * at chip-adjacent boundaries so the result remains walkable.
 */
export function insertMediaRefAtOffset(
  doc: PromptDoc,
  offset: number,
  chip: MediaRefBlock,
): PromptDoc {
  const out: PromptBlock[] = [];
  let pos = 0;
  let inserted = false;

  for (const block of doc.blocks) {
    if (inserted) {
      out.push(block);
      continue;
    }

    if (block.type === 'text') {
      const len = block.value.length;
      if (offset >= pos && offset <= pos + len) {
        const split = offset - pos;
        out.push({ type: 'text', value: block.value.slice(0, split) });
        out.push(chip);
        out.push({ type: 'text', value: block.value.slice(split) });
        inserted = true;
      } else {
        out.push(block);
      }
      pos += len;
      continue;
    }

    // chip block
    if (offset === pos) {
      out.push({ type: 'text', value: '' });
      out.push(chip);
      out.push(block);
      inserted = true;
    } else {
      out.push(block);
    }
    pos += 1;
  }

  if (!inserted) {
    if (out.length === 0 || out[out.length - 1].type !== 'text') {
      out.push({ type: 'text', value: '' });
    }
    out.push(chip);
    out.push({ type: 'text', value: '' });
  }

  return { schemaVersion: 1, blocks: out };
}

/** Total number of text characters in `doc` (chips are not counted). */
export function countTextChars(doc: PromptDoc): number {
  let total = 0;
  for (const b of doc.blocks) {
    if (b.type === 'text') total += b.value.length;
  }
  return total;
}
