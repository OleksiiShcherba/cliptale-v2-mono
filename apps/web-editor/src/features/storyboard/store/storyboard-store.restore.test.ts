/**
 * Tests for the `restoreFromSnapshot` action in storyboard-store.
 *
 * Covers:
 * - nodes are reconstructed as proper React Flow Node[] from StoryboardBlock[]
 * - edges are reconstructed with source/target from sourceBlockId/targetBlockId
 * - positions map is rebuilt from the reconstructed node positions
 * - selectedBlockId is reset to null after restore
 * - subscribed listeners are notified after restore
 * - position fallback: when snapshot.positions is absent, positionX/Y are used
 *
 * No DOM, no React — pure Vitest unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock storyboard-history-store BEFORE importing storyboard-store
// to break the circular import chain at test time.
// storyboard-history-store imports storyboard-store (value import) so we
// prevent that side-effect from running in this test suite.
vi.mock('./storyboard-history-store', () => ({
  // CanvasSnapshot is a type — no runtime value needed.
}));

import {
  restoreFromSnapshot,
  getSnapshot,
  setState,
  subscribe,
} from './storyboard-store';
import type { CanvasSnapshot } from './storyboard-history-store';
import type { StoryboardBlock, StoryboardEdge } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Scene 1',
    prompt: null,
    durationS: 5,
    positionX: 100,
    positionY: 200,
    sortOrder: 1,
    style: null,
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
    mediaItems: [],
    ...overrides,
  };
}

function makeEdge(overrides: Partial<StoryboardEdge> = {}): StoryboardEdge {
  return {
    id: 'edge-1',
    draftId: 'draft-1',
    sourceBlockId: 'block-start',
    targetBlockId: 'block-1',
    ...overrides,
  };
}

function makeSnapshot(): CanvasSnapshot {
  return {
    blocks: [makeBlock()],
    edges: [makeEdge()],
    positions: {
      'block-1': { x: 100, y: 200 },
    },
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset store to a known state before each test.
  setState({
    nodes: [],
    edges: [],
    positions: {},
    selectedBlockId: 'some-selected-id',
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('storyboard-store — restoreFromSnapshot', () => {
  it('reconstructs nodes as proper React Flow Node shapes from StoryboardBlock[]', () => {
    const snapshot = makeSnapshot();

    restoreFromSnapshot(snapshot);

    const { nodes } = getSnapshot();
    expect(nodes).toHaveLength(1);
    // Must have required React Flow node fields — not a raw StoryboardBlock cast.
    expect(nodes[0]).toMatchObject({
      id: 'block-1',
      type: 'scene-block',
      position: { x: 100, y: 200 },
    });
    expect(typeof nodes[0].data).toBe('object');
  });

  it('reconstructs edges with source/target from sourceBlockId/targetBlockId', () => {
    const snapshot = makeSnapshot();

    restoreFromSnapshot(snapshot);

    const { edges } = getSnapshot();
    expect(edges).toHaveLength(1);
    // React Flow requires source/target — NOT sourceBlockId/targetBlockId.
    expect(edges[0]).toMatchObject({
      id: 'edge-1',
      source: 'block-start',
      target: 'block-1',
    });
    // Raw StoryboardEdge fields must not leak into the React Flow edge.
    expect(edges[0]).not.toHaveProperty('sourceBlockId');
    expect(edges[0]).not.toHaveProperty('targetBlockId');
  });

  it('rebuilds the positions map from the reconstructed node positions', () => {
    const snapshot = makeSnapshot();

    restoreFromSnapshot(snapshot);

    expect(getSnapshot().positions).toEqual({ 'block-1': { x: 100, y: 200 } });
  });

  it('resets selectedBlockId to null', () => {
    // beforeEach sets selectedBlockId to 'some-selected-id'
    const snapshot = makeSnapshot();

    restoreFromSnapshot(snapshot);

    expect(getSnapshot().selectedBlockId).toBeNull();
  });

  it('notifies subscribed listeners after restore', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const snapshot = makeSnapshot();

    restoreFromSnapshot(snapshot);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('falls back to block.positionX/Y when snapshot.positions is absent', () => {
    // Simulates the server path where positions are not serialised into the snapshot
    // but are stored per-block in the DB as positionX/positionY.
    const block = makeBlock({ id: 'block-2', positionX: 300, positionY: 400 });
    const snapshotWithoutPositions = {
      blocks: [block],
      edges: [],
      // positions is intentionally omitted — cast to CanvasSnapshot to bypass type
    } as unknown as CanvasSnapshot;

    restoreFromSnapshot(snapshotWithoutPositions);

    const { nodes, positions } = getSnapshot();
    expect(nodes[0].position).toEqual({ x: 300, y: 400 });
    expect(positions['block-2']).toEqual({ x: 300, y: 400 });
  });
});
