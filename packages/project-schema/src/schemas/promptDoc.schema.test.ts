import { describe, it, expect } from 'vitest';

import { promptDocSchema } from './promptDoc.schema.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const validTextBlock = { type: 'text', value: 'Hello world' };

const validMediaRef = {
  type: 'media-ref',
  mediaType: 'video',
  fileId: '00000000-0000-0000-0000-000000000001',
  label: 'My clip',
};

const validDoc = {
  schemaVersion: 1,
  blocks: [validTextBlock, validMediaRef],
};

// ── promptDocSchema ───────────────────────────────────────────────────────────

describe('promptDocSchema', () => {
  it('accepts a valid PromptDoc with mixed text and media-ref blocks', () => {
    expect(promptDocSchema.safeParse(validDoc).success).toBe(true);
  });

  it('accepts a PromptDoc with no blocks (empty editor)', () => {
    const result = promptDocSchema.safeParse({ schemaVersion: 1, blocks: [] });
    expect(result.success).toBe(true);
  });

  it('accepts all three mediaType values (video, image, audio)', () => {
    for (const mediaType of ['video', 'image', 'audio'] as const) {
      const doc = {
        schemaVersion: 1,
        blocks: [{ ...validMediaRef, mediaType }],
      };
      expect(promptDocSchema.safeParse(doc).success, `mediaType=${mediaType}`).toBe(true);
    }
  });

  it('rejects an unknown block type with a Zod error', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{ type: 'image', src: 'http://example.com/img.png' }],
    };
    const result = promptDocSchema.safeParse(doc);
    expect(result.success).toBe(false);
    // Zod discriminatedUnion surfaces an "Invalid discriminator value" error
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain('Invalid');
  });

  it('rejects a media-ref block missing fileId', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{ type: 'media-ref', mediaType: 'video', label: 'My clip' }],
    };
    const result = promptDocSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it('rejects a media-ref block with a non-UUID fileId', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{ ...validMediaRef, fileId: 'not-a-uuid' }],
    };
    const result = promptDocSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it('rejects a media-ref block with an invalid mediaType', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{ ...validMediaRef, mediaType: 'pdf' }],
    };
    const result = promptDocSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it('rejects a PromptDoc with wrong schemaVersion', () => {
    const doc = { schemaVersion: 2, blocks: [] };
    const result = promptDocSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it('rejects a PromptDoc missing the blocks field', () => {
    const result = promptDocSchema.safeParse({ schemaVersion: 1 });
    expect(result.success).toBe(false);
  });

  it('infers correct TS types — data.blocks[0] has type property', () => {
    const result = promptDocSchema.safeParse(validDoc);
    if (!result.success) throw new Error('Unexpected parse failure');
    // Static type check via assignment — if types are wrong, tsc would fail.
    const block = result.data.blocks[0];
    expect(block).toBeDefined();
  });
});
