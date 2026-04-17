/**
 * Pure helper functions for the enhance-prompt sentinel-splice strategy.
 *
 * The LLM receives a text-only serialization where every `media-ref` block is
 * replaced by a numbered placeholder (`{{MEDIA_1}}`, `{{MEDIA_2}}`, …).
 * After the LLM returns the rewritten text we splice the original media-ref
 * blocks back in at the sentinel positions, then validate the result.
 *
 * Keeping these as pure functions (no I/O, no side effects) lets us test the
 * token-preservation logic exhaustively without any OpenAI mock setup.
 */

import type { MediaRefBlock, PromptDoc } from '@ai-video-editor/project-schema';

/**
 * Result of serializing a PromptDoc into a text-only string with sentinels.
 */
export type SentinelResult = {
  /** Plain text string sent to the LLM. Contains `{{MEDIA_N}}` markers (1-indexed). */
  text: string;
  /** Ordered array of media-ref blocks extracted from the doc, parallel to sentinel indices. */
  media: MediaRefBlock[];
};

/**
 * Serializes a `PromptDoc` into a text-only string suitable for LLM input.
 *
 * Each `media-ref` block is replaced with `{{MEDIA_N}}` (1-indexed) and
 * collected in `media[]` in order. Adjacent text blocks are joined without
 * extra whitespace; the caller's text is preserved verbatim.
 *
 * @example
 * // doc with text "Hello " + media-ref + " world"
 * // → { text: "Hello {{MEDIA_1}} world", media: [<mediaRefBlock>] }
 */
export function serializeWithSentinels(doc: PromptDoc): SentinelResult {
  const media: MediaRefBlock[] = [];
  const parts: string[] = [];

  for (const block of doc.blocks) {
    if (block.type === 'text') {
      parts.push(block.value);
    } else {
      // block.type === 'media-ref'
      media.push(block);
      parts.push(`{{MEDIA_${media.length}}}`);
    }
  }

  return { text: parts.join(''), media };
}

/**
 * Validates that the LLM output text preserves all sentinels exactly once
 * and in the original order.
 *
 * Returns `null` if valid; returns a description string if a violation is found.
 * The caller converts a non-null return into an `EnhanceTokenPreservationError`.
 */
export function validateSentinelIntegrity(text: string, expectedCount: number): string | null {
  if (expectedCount === 0) {
    // No sentinels expected — text must contain none
    if (/\{\{MEDIA_\d+\}\}/u.test(text)) {
      return 'LLM introduced unexpected {{MEDIA_N}} sentinels in a prompt that had no media refs';
    }
    return null;
  }

  // Collect all sentinel occurrences and their indices
  const found: number[] = [];
  const pattern = /\{\{MEDIA_(\d+)\}\}/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    found.push(parseInt(match[1]!, 10));
  }

  if (found.length !== expectedCount) {
    return `Expected ${expectedCount} sentinel(s), found ${found.length}`;
  }

  for (let i = 0; i < expectedCount; i++) {
    const expected = i + 1; // 1-indexed
    if (found[i] !== expected) {
      return `Sentinel at position ${i + 1} is {{MEDIA_${found[i]}}} but expected {{MEDIA_${expected}}}`;
    }
  }

  return null;
}

/**
 * Splices the original `media-ref` blocks back into the LLM-rewritten text at
 * the sentinel positions, producing a new `PromptDoc`.
 *
 * Text segments between sentinels become `text` blocks (empty segments are
 * omitted to keep the doc clean). Each `{{MEDIA_N}}` is replaced by the
 * corresponding entry from `media[]`.
 *
 * This function assumes `validateSentinelIntegrity` has already passed —
 * i.e. every sentinel is present exactly once and in order.
 */
export function spliceSentinels(text: string, media: MediaRefBlock[]): PromptDoc {
  if (media.length === 0) {
    return {
      schemaVersion: 1,
      blocks: text.length > 0 ? [{ type: 'text', value: text }] : [],
    };
  }

  const blocks: PromptDoc['blocks'] = [];
  // Split on sentinel tokens, keeping the delimiters via a capture group
  const parts = text.split(/(\{\{MEDIA_\d+\}\})/u);

  for (const part of parts) {
    const sentinelMatch = /^\{\{MEDIA_(\d+)\}\}$/u.exec(part);
    if (sentinelMatch) {
      const index = parseInt(sentinelMatch[1]!, 10) - 1; // convert to 0-indexed
      const mediaBlock = media[index];
      if (mediaBlock) {
        blocks.push(mediaBlock);
      }
    } else if (part.length > 0) {
      blocks.push({ type: 'text', value: part });
    }
  }

  return { schemaVersion: 1, blocks };
}
