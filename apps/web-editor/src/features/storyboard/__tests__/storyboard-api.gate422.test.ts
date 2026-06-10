/**
 * RED tests for T10 — api.ts must surface structured 422 gate errors.
 *
 * AC-02 / AC-03b / AC-04b — the start endpoints return 422 with a body that
 * carries { error, code, details }:
 *   code 'references.reference_gate_failed'  + details.blocks: [{blockId, name}]
 *   code 'references.unlinked_scenes'        + details.scenes: [{blockId, name|null}]
 *
 * Today startStoryboardIllustrations / startStoryboardBlockIllustration throw
 * `new Error(body?.error ?? ...)` — the string-only path that discards code and
 * details entirely.  These tests assert the NEW contract: the thrown value must
 * be (or carry) an object with { code, details } so callers can distinguish the
 * two gate branches and render named blocks / scenes.
 *
 * All tests here are expected to FAIL (RED) until T10 wires the structured error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import {
  startStoryboardIllustrations,
  startStoryboardBlockIllustration,
} from '../api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function make422Response(body: unknown): Response {
  return {
    ok: false,
    status: 422,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T10 / AC-02 — startStoryboardIllustrations: reference_gate_failed 422 surfaces code+details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error that carries code="references.reference_gate_failed"', async () => {
    mockApiClient.post.mockResolvedValue(
      make422Response({
        error: '2 reference blocks have not finished generating.',
        code: 'references.reference_gate_failed',
        details: {
          blocks: [
            { blockId: 'block-aaa', name: 'Test Character' },
            { blockId: 'block-bbb', name: 'Test Environment' },
          ],
        },
      }),
    );

    let thrown: unknown;
    try {
      await startStoryboardIllustrations('draft-1');
    } catch (err) {
      thrown = err;
    }

    // The thrown value must expose .code so the hook/UI can branch on it.
    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe('references.reference_gate_failed');
  });

  it('thrown error carries details.blocks with blockId and name for each blocker', async () => {
    const blocks = [
      { blockId: 'block-aaa', name: 'Test Character' },
      { blockId: 'block-bbb', name: 'Test Environment' },
    ];
    mockApiClient.post.mockResolvedValue(
      make422Response({
        error: '2 reference blocks have not finished generating.',
        code: 'references.reference_gate_failed',
        details: { blocks },
      }),
    );

    let thrown: unknown;
    try {
      await startStoryboardIllustrations('draft-1');
    } catch (err) {
      thrown = err;
    }

    const details = (thrown as { details?: { blocks?: unknown } }).details;
    expect(details).toBeDefined();
    expect(details?.blocks).toEqual(blocks);
  });
});

describe('T10 / AC-04b — startStoryboardIllustrations: unlinked_scenes 422 surfaces code+details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error that carries code="references.unlinked_scenes"', async () => {
    mockApiClient.post.mockResolvedValue(
      make422Response({
        error: '1 scene has no linked reference.',
        code: 'references.unlinked_scenes',
        details: {
          scenes: [
            { blockId: 'scene-ccc', name: 'Test Scene' },
          ],
        },
      }),
    );

    let thrown: unknown;
    try {
      await startStoryboardIllustrations('draft-1');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe('references.unlinked_scenes');
  });

  it('thrown error carries details.scenes with blockId and name (null-safe)', async () => {
    const scenes = [
      { blockId: 'scene-ccc', name: 'Test Scene' },
      { blockId: 'scene-ddd', name: null },
    ];
    mockApiClient.post.mockResolvedValue(
      make422Response({
        error: '2 scenes have no linked reference.',
        code: 'references.unlinked_scenes',
        details: { scenes },
      }),
    );

    let thrown: unknown;
    try {
      await startStoryboardIllustrations('draft-1');
    } catch (err) {
      thrown = err;
    }

    const details = (thrown as { details?: { scenes?: unknown } }).details;
    expect(details).toBeDefined();
    expect(details?.scenes).toEqual(scenes);
  });
});

describe('T10 / AC-03b — startStoryboardBlockIllustration: per-scene reference_gate_failed 422 surfaces code+details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error that carries code="references.reference_gate_failed" with the scene-scoped blocks', async () => {
    const blocks = [{ blockId: 'block-aaa', name: 'Test Character' }];
    mockApiClient.post.mockResolvedValue(
      make422Response({
        error: '1 reference block linked to this scene has not finished generating.',
        code: 'references.reference_gate_failed',
        details: { blocks },
      }),
    );

    let thrown: unknown;
    try {
      await startStoryboardBlockIllustration('draft-1', 'scene-block-1');
    } catch (err) {
      thrown = err;
    }

    expect((thrown as { code?: string }).code).toBe('references.reference_gate_failed');
    expect((thrown as { details?: { blocks?: unknown } }).details?.blocks).toEqual(blocks);
  });
});
