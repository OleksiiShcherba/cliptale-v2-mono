import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

// ── Helper types ─────────────────────────────────────────────────────────────

type PathItem = Record<string, unknown>;
type Paths = Record<string, PathItem>;

const paths = openApiSpec.paths as unknown as Paths;
const schemas = (openApiSpec.components as { schemas: Record<string, unknown> }).schemas;

// ── Storyboard schema tests ──────────────────────────────────────────────────

describe('openApiSpec storyboard component schemas', () => {
  it('defines BlockMediaItem schema with required fields', () => {
    const schema = schemas['BlockMediaItem'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('fileId');
    expect(required).toContain('mediaType');
    expect(required).toContain('sortOrder');
  });

  it('defines StoryboardBlock schema with required fields', () => {
    const schema = schemas['StoryboardBlock'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('blockType');
    expect(required).toContain('mediaItems');
    expect(required).toContain('createdAt');
    expect(required).toContain('updatedAt');
  });

  it('StoryboardBlock.blockType enum covers start, end, scene', () => {
    const schema = schemas['StoryboardBlock'] as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blockType?.enum).toEqual(expect.arrayContaining(['start', 'end', 'scene']));
  });

  it('defines StoryboardEdge schema with required fields', () => {
    const schema = schemas['StoryboardEdge'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('sourceBlockId');
    expect(required).toContain('targetBlockId');
  });

  it('defines StoryboardState schema with blocks and edges arrays', () => {
    const schema = schemas['StoryboardState'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blocks?.type).toBe('array');
    expect(props.edges?.type).toBe('array');
  });

  it('defines SaveStoryboardBody schema with blocks and edges', () => {
    const schema = schemas['SaveStoryboardBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
  });

  it('defines PushHistoryBody schema with required snapshot field', () => {
    const schema = schemas['PushHistoryBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('snapshot');
  });

  it('defines StoryboardHistoryEntry schema with required id, draftId, snapshot, createdAt', () => {
    const schema = schemas['StoryboardHistoryEntry'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('snapshot');
    expect(required).toContain('createdAt');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    // id must be integer type (auto-incremented row id)
    expect(props.id?.type).toBe('integer');
  });
});

// ── All storyboard operations have bearerAuth ────────────────────────────────

describe('openApiSpec storyboard security coverage', () => {
  const storyboardPaths = [
    ['/storyboards/{draftId}/initialize', 'post'],
    ['/storyboards/{draftId}', 'get'],
    ['/storyboards/{draftId}', 'put'],
    ['/storyboards/{draftId}/history', 'get'],
    ['/storyboards/{draftId}/history', 'post'],
  ] as const;

  it.each(storyboardPaths)(
    '%s %s declares bearerAuth security',
    (path, method) => {
      const op = paths[path]?.[method] as Record<string, unknown>;
      const security = op?.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    },
  );

  it.each(storyboardPaths)(
    '%s %s declares storyboard tag',
    (path, method) => {
      const op = paths[path]?.[method] as Record<string, unknown>;
      expect(op?.tags).toContain('storyboard');
    },
  );
});
