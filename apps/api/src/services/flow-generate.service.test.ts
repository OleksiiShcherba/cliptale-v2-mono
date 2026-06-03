/**
 * T9 — flow-generate.service unit tests (cost-estimate function only).
 *
 * Tests cover:
 *  - estimateBlockCost resolves model from saved canvas and returns a best-effort Money estimate
 *  - bestEffort is always true
 *  - result is non-mutating (canvas unchanged after call)
 *  - unknown model still returns a best-effort estimate (AC-11 / openapi)
 *  - no provider (external) call is made (spy asserts no HTTP)
 *  - block not found in canvas throws / propagates an error
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FlowCanvas } from '@ai-video-editor/project-schema';

// We mock the repository so no DB calls are made.
vi.mock('@/repositories/generation-flow.repository.js', () => ({
  findFlowById: vi.fn(),
}));

// We also want to assert no external HTTP calls ever happen.
// Mock fetch globally — if estimateBlockCost calls fetch it will fail the spy.
const fetchSpy = vi.spyOn(globalThis, 'fetch');

import { findFlowById } from '@/repositories/generation-flow.repository.js';
import { estimateBlockCost } from './flow-generate.service.js';

const FLOW_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_MODEL_ID = 'unknown-vendor/nonexistent-model-xyz';
const KNOWN_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';

function makeCanvas(modelId: string): FlowCanvas {
  return {
    blocks: [
      {
        blockId: BLOCK_ID,
        type: 'generation',
        position: { x: 0, y: 0 },
        params: { modelId },
      },
    ],
    edges: [],
  };
}

function makeFlowRecord(canvas: FlowCanvas) {
  return {
    flowId: FLOW_ID,
    userId: USER_ID,
    title: 'Test flow',
    canvas,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockReset();
});

describe('estimateBlockCost — known model', () => {
  it('returns a CostEstimate with bestEffort: true for a known model', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    const result = await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(result.bestEffort).toBe(true);
    expect(result.flowId).toBe(FLOW_ID);
    expect(result.blockId).toBe(BLOCK_ID);
    expect(result.modelId).toBe(KNOWN_MODEL_ID);
    expect(result.estimate.currency).toBe('USD');
    expect(typeof result.estimate.amount).toBe('number');
    expect(result.estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the canvas after estimating', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    const originalJson = JSON.stringify(canvas);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(JSON.stringify(canvas)).toBe(originalJson);
  });

  it('makes no external provider call (fetch not called)', async () => {
    const canvas = makeCanvas(KNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('estimateBlockCost — unknown model', () => {
  it('still returns a best-effort estimate for an unknown model (AC-11 / openapi)', async () => {
    const canvas = makeCanvas(UNKNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    const result = await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(result.bestEffort).toBe(true);
    expect(result.modelId).toBe(UNKNOWN_MODEL_ID);
    expect(result.estimate.currency).toBe('USD');
    expect(typeof result.estimate.amount).toBe('number');
    expect(result.estimate.amount).toBeGreaterThanOrEqual(0);
  });

  it('makes no external provider call for unknown model either', async () => {
    const canvas = makeCanvas(UNKNOWN_MODEL_ID);
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('estimateBlockCost — flow not found', () => {
  it('throws NotFoundError when the flow does not exist or is not owned', async () => {
    vi.mocked(findFlowById).mockResolvedValue(null);

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });
});

describe('estimateBlockCost — block not a generation block', () => {
  it('throws when the blockId is not found in canvas blocks', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        {
          blockId: 'different-block-id',
          type: 'generation',
          position: { x: 0, y: 0 },
          params: { modelId: KNOWN_MODEL_ID },
        },
      ],
      edges: [],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });

  it('throws when the block exists but is not a generation block', async () => {
    const canvas: FlowCanvas = {
      blocks: [
        {
          blockId: BLOCK_ID,
          type: 'content',
          position: { x: 0, y: 0 },
          params: {},
        },
      ],
      edges: [],
    };
    vi.mocked(findFlowById).mockResolvedValue(makeFlowRecord(canvas));

    await expect(
      estimateBlockCost({ flowId: FLOW_ID, blockId: BLOCK_ID, userId: USER_ID }),
    ).rejects.toThrow();
  });
});
