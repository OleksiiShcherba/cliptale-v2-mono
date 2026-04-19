/**
 * Pure unit tests for the sentinel-splice helper functions.
 *
 * These tests require no OpenAI mock — the helpers are stateless pure functions.
 */

import { describe, it, expect } from 'vitest';

import type { MediaRefBlock, PromptDoc } from '@ai-video-editor/project-schema';

import {
  serializeWithSentinels,
  spliceSentinels,
  validateSentinelIntegrity,
} from './enhancePrompt.helpers.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEDIA_VIDEO: MediaRefBlock = {
  type: 'media-ref',
  mediaType: 'video',
  fileId: 'a1b2c3d4-0000-0000-0000-000000000001',
  label: 'Clip A',
};

const MEDIA_IMAGE: MediaRefBlock = {
  type: 'media-ref',
  mediaType: 'image',
  fileId: 'a1b2c3d4-0000-0000-0000-000000000002',
  label: 'Photo B',
};

function makeDoc(blocks: PromptDoc['blocks']): PromptDoc {
  return { schemaVersion: 1, blocks };
}

// ── serializeWithSentinels ────────────────────────────────────────────────────

describe('serializeWithSentinels', () => {
  it('should produce sentinel-interpolated text and parallel media array for a doc with two media refs', () => {
    const doc = makeDoc([
      { type: 'text', value: 'Start ' },
      MEDIA_VIDEO,
      { type: 'text', value: ' middle ' },
      MEDIA_IMAGE,
      { type: 'text', value: ' end' },
    ]);

    const { text, media } = serializeWithSentinels(doc);

    expect(text).toBe('Start {{MEDIA_1}} middle {{MEDIA_2}} end');
    expect(media).toHaveLength(2);
    expect(media[0]).toEqual(MEDIA_VIDEO);
    expect(media[1]).toEqual(MEDIA_IMAGE);
  });

  it('should return verbatim text and empty media array for a text-only prompt', () => {
    const doc = makeDoc([{ type: 'text', value: 'Hello world' }]);

    const { text, media } = serializeWithSentinels(doc);

    expect(text).toBe('Hello world');
    expect(media).toHaveLength(0);
  });

  it('should handle a prompt that starts with a media-ref block', () => {
    const doc = makeDoc([MEDIA_VIDEO, { type: 'text', value: ' followed by text' }]);

    const { text, media } = serializeWithSentinels(doc);

    expect(text).toBe('{{MEDIA_1}} followed by text');
    expect(media[0]).toEqual(MEDIA_VIDEO);
  });

  it('should handle a prompt that ends with a media-ref block', () => {
    const doc = makeDoc([{ type: 'text', value: 'text then ' }, MEDIA_IMAGE]);

    const { text, media } = serializeWithSentinels(doc);

    // MEDIA_IMAGE is the only (first) media block in this doc → sentinel is {{MEDIA_1}}
    expect(text).toBe('text then {{MEDIA_1}}');
    expect(media[0]).toEqual(MEDIA_IMAGE);
  });

  it('should handle an empty doc (zero blocks)', () => {
    const doc = makeDoc([]);

    const { text, media } = serializeWithSentinels(doc);

    expect(text).toBe('');
    expect(media).toHaveLength(0);
  });

  it('should handle a doc with only a single media-ref and no text', () => {
    const doc = makeDoc([MEDIA_VIDEO]);

    const { text, media } = serializeWithSentinels(doc);

    expect(text).toBe('{{MEDIA_1}}');
    expect(media).toHaveLength(1);
    expect(media[0]).toEqual(MEDIA_VIDEO);
  });
});

// ── validateSentinelIntegrity ─────────────────────────────────────────────────

describe('validateSentinelIntegrity', () => {
  it('should return null when all expected sentinels appear in order', () => {
    const result = validateSentinelIntegrity(
      'Hello {{MEDIA_1}} and {{MEDIA_2}} world',
      2,
    );
    expect(result).toBeNull();
  });

  it('should return null for a zero-sentinel text that contains no markers', () => {
    const result = validateSentinelIntegrity('Plain text, no media', 0);
    expect(result).toBeNull();
  });

  it('should return an error message when a sentinel is missing from LLM output', () => {
    const result = validateSentinelIntegrity('Hello {{MEDIA_1}} world', 2);
    expect(result).not.toBeNull();
    expect(result).toMatch(/Expected 2/);
    expect(result).toMatch(/found 1/);
  });

  it('should return an error message when a sentinel is duplicated', () => {
    const result = validateSentinelIntegrity(
      'Hello {{MEDIA_1}} and {{MEDIA_1}} world',
      2,
    );
    // Two sentinels found but second is {{MEDIA_1}} not {{MEDIA_2}} — reorder violation
    expect(result).not.toBeNull();
  });

  it('should return an error message when sentinels are reordered', () => {
    const result = validateSentinelIntegrity(
      'Hello {{MEDIA_2}} and {{MEDIA_1}} world',
      2,
    );
    expect(result).not.toBeNull();
    expect(result).toMatch(/position 1/);
  });

  it('should return an error when LLM introduces a sentinel in a text-only prompt', () => {
    const result = validateSentinelIntegrity('Hello {{MEDIA_1}} world', 0);
    expect(result).not.toBeNull();
    expect(result).toMatch(/unexpected/i);
  });

  it('should return an error when count matches but indices are wrong', () => {
    // LLM outputs {{MEDIA_2}} and {{MEDIA_3}} instead of {{MEDIA_1}} and {{MEDIA_2}}
    const result = validateSentinelIntegrity('{{MEDIA_2}} and {{MEDIA_3}}', 2);
    expect(result).not.toBeNull();
    expect(result).toMatch(/position 1/);
  });
});

// ── spliceSentinels ───────────────────────────────────────────────────────────

describe('spliceSentinels', () => {
  it('should reconstruct a PromptDoc with media-ref blocks at sentinel positions', () => {
    const text = 'Start {{MEDIA_1}} middle {{MEDIA_2}} end';
    const media: MediaRefBlock[] = [MEDIA_VIDEO, MEDIA_IMAGE];

    const doc = spliceSentinels(text, media);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.blocks).toHaveLength(5);
    expect(doc.blocks[0]).toEqual({ type: 'text', value: 'Start ' });
    expect(doc.blocks[1]).toEqual(MEDIA_VIDEO);
    expect(doc.blocks[2]).toEqual({ type: 'text', value: ' middle ' });
    expect(doc.blocks[3]).toEqual(MEDIA_IMAGE);
    expect(doc.blocks[4]).toEqual({ type: 'text', value: ' end' });
  });

  it('should reconstruct a text-only PromptDoc when media array is empty', () => {
    const text = 'Just plain text with no sentinels';
    const doc = spliceSentinels(text, []);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toEqual({ type: 'text', value: text });
  });

  it('should produce an empty blocks array for an empty text with no media', () => {
    const doc = spliceSentinels('', []);

    expect(doc.schemaVersion).toBe(1);
    expect(doc.blocks).toHaveLength(0);
  });

  it('should handle a single media-ref with no surrounding text', () => {
    const text = '{{MEDIA_1}}';
    const doc = spliceSentinels(text, [MEDIA_VIDEO]);

    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toEqual(MEDIA_VIDEO);
  });

  it('should omit empty text segments (no extra empty blocks at boundaries)', () => {
    // Sentinel at the very start — no text before it
    const text = '{{MEDIA_1}} some text';
    const doc = spliceSentinels(text, [MEDIA_VIDEO]);

    // Only media-ref + text, no empty text block before the media
    expect(doc.blocks[0]).toEqual(MEDIA_VIDEO);
    expect(doc.blocks[1]).toEqual({ type: 'text', value: ' some text' });
    expect(doc.blocks).toHaveLength(2);
  });

  it('should round-trip through serializeWithSentinels and spliceSentinels preserving all blocks', () => {
    const originalDoc = makeDoc([
      { type: 'text', value: 'Intro ' },
      MEDIA_VIDEO,
      { type: 'text', value: ' and then ' },
      MEDIA_IMAGE,
      { type: 'text', value: ' outro.' },
    ]);

    const { text, media } = serializeWithSentinels(originalDoc);
    const restoredDoc = spliceSentinels(text, media);

    expect(restoredDoc.blocks).toEqual(originalDoc.blocks);
  });
});
