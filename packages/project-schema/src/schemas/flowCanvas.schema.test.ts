import { describe, it, expect } from 'vitest';

import {
  flowCanvasSchema,
  flowBlockSchema,
  flowEdgeSchema,
} from './flowCanvas.schema.js';
import type { FlowCanvas, FlowBlock, FlowEdge } from './flowCanvas.schema.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const validContentBlock: FlowBlock = {
  blockId: '00000000-0000-4000-8000-000000000001',
  type: 'content',
  position: { x: 100, y: 200 },
  params: {},
};

const validGenerationBlock: FlowBlock = {
  blockId: '00000000-0000-4000-8000-000000000002',
  type: 'generation',
  position: { x: 400, y: 200 },
  params: { modelId: 'fal-ai/kling-video/v2/master/image-to-video', duration: 5 },
};

const validResultBlock: FlowBlock = {
  blockId: '00000000-0000-4000-8000-000000000003',
  type: 'result',
  position: { x: 700, y: 200 },
  params: {},
};

const validEdge: FlowEdge = {
  edgeId: 'edge-00000000-0000-4000-8000-000000000001',
  sourceBlockId: '00000000-0000-4000-8000-000000000001',
  sourceHandle: 'output',
  targetBlockId: '00000000-0000-4000-8000-000000000002',
  targetHandle: 'image_input',
};

const validCanvas: FlowCanvas = {
  blocks: [validContentBlock, validGenerationBlock, validResultBlock],
  edges: [validEdge],
};

// ── flowBlockSchema ────────────────────────────────────────────────────────────

describe('flowBlockSchema', () => {
  it('accepts a valid content block', () => {
    const result = flowBlockSchema.safeParse(validContentBlock);
    expect(result.success).toBe(true);
  });

  it('accepts a valid generation block with arbitrary params', () => {
    const result = flowBlockSchema.safeParse(validGenerationBlock);
    expect(result.success).toBe(true);
    expect(result.success && result.data.params).toMatchObject({ modelId: 'fal-ai/kling-video/v2/master/image-to-video' });
  });

  it('accepts a valid result block', () => {
    const result = flowBlockSchema.safeParse(validResultBlock);
    expect(result.success).toBe(true);
  });

  it('rejects a block with unknown type', () => {
    const result = flowBlockSchema.safeParse({ ...validContentBlock, type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a block missing blockId', () => {
    const { blockId: _omitted, ...without } = validContentBlock;
    const result = flowBlockSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects a block missing position', () => {
    const { position: _omitted, ...without } = validContentBlock;
    const result = flowBlockSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// ── flowEdgeSchema ─────────────────────────────────────────────────────────────

describe('flowEdgeSchema', () => {
  it('accepts a valid edge', () => {
    const result = flowEdgeSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it('rejects an edge missing sourceBlockId', () => {
    const { sourceBlockId: _omitted, ...without } = validEdge;
    const result = flowEdgeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects an edge missing targetBlockId', () => {
    const { targetBlockId: _omitted, ...without } = validEdge;
    const result = flowEdgeSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// ── flowCanvasSchema parse + round-trip ────────────────────────────────────────

describe('flowCanvasSchema', () => {
  it('accepts an empty canvas (no blocks, no edges)', () => {
    const result = flowCanvasSchema.safeParse({ blocks: [], edges: [] });
    expect(result.success).toBe(true);
    expect(result.success && result.data.blocks).toHaveLength(0);
    expect(result.success && result.data.edges).toHaveLength(0);
  });

  it('accepts a canvas with mixed block types and an edge', () => {
    const result = flowCanvasSchema.safeParse(validCanvas);
    expect(result.success).toBe(true);
  });

  it('round-trips: parse → JSON.stringify → parse gives identical data', () => {
    const first = flowCanvasSchema.parse(validCanvas);
    const serialized = JSON.stringify(first);
    const second = flowCanvasSchema.parse(JSON.parse(serialized));
    expect(second).toEqual(first);
  });

  it('rejects a canvas missing blocks', () => {
    const result = flowCanvasSchema.safeParse({ edges: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a canvas missing edges', () => {
    const result = flowCanvasSchema.safeParse({ blocks: [] });
    expect(result.success).toBe(false);
  });

  it('preserves per-block params on round-trip', () => {
    const canvas: FlowCanvas = {
      blocks: [{ ...validGenerationBlock, params: { modelId: 'fal-ai/stable-diffusion-3', steps: 20, seed: 42 } }],
      edges: [],
    };
    const parsed = flowCanvasSchema.parse(canvas);
    expect(parsed.blocks[0]?.params).toEqual({ modelId: 'fal-ai/stable-diffusion-3', steps: 20, seed: 42 });
  });
});
