/**
 * Tests for storyboard-history-store.
 *
 * Covers:
 * - push caps at MAX_HISTORY_SIZE (add 55 snapshots → length 50)
 * - undo moves cursor back by one
 * - redo moves cursor forward by one
 * - undo at bottom of stack is a no-op
 * - redo at top of stack is a no-op
 * - push after undo discards forward history
 * - loadServerHistory seeds the stack and sets cursor to top
 * - server persistence is called (debounced, fire-and-forget)
 * - CanvasSnapshot accepts optional thumbnail field (ST2)
 * - StoryboardHistoryPayload with thumbnail is forwarded to persistHistorySnapshot (ST2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api module before importing the store so persistHistorySnapshot is never called.
vi.mock('../api', () => ({
  persistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
}));

// Mock the storyboard-store so applySnapshot does not throw when there are no nodes.
vi.mock('./storyboard-store', () => ({
  getSnapshot: vi.fn().mockReturnValue({ nodes: [], edges: [], positions: {} }),
  setNodes: vi.fn(),
  setEdges: vi.fn(),
}));

import {
  push,
  undo,
  redo,
  initHistoryStore,
  destroyHistoryStore,
  loadServerHistory,
  getHistorySize,
  getHistoryCursor,
  MAX_HISTORY_SIZE,
} from './storyboard-history-store';
import type { CanvasSnapshot } from './storyboard-history-store';
import type { StoryboardHistorySnapshot, StoryboardHistoryPayload } from '../api';
import { persistHistorySnapshot } from '../api';
import { setNodes } from './storyboard-store';

// ── Fixture ────────────────────────────────────────────────────────────────────

function makeSnapshot(id: string): CanvasSnapshot {
  return {
    blocks: [
      {
        id,
        draftId: 'draft-1',
        blockType: 'scene',
        name: `Scene ${id}`,
        prompt: null,
        durationS: 5,
        positionX: 100,
        positionY: 200,
        sortOrder: 1,
        style: null,
        createdAt: '2026-04-22T00:00:00Z',
        updatedAt: '2026-04-22T00:00:00Z',
        mediaItems: [],
      },
    ],
    edges: [],
    positions: { [id]: { x: 100, y: 200 } },
  };
}

function makeServerSnapshot(id: string): StoryboardHistorySnapshot {
  return {
    snapshot: {
      blocks: [
        {
          id,
          draftId: 'draft-1',
          blockType: 'scene',
          name: `Scene ${id}`,
          prompt: null,
          durationS: 5,
          positionX: 100,
          positionY: 200,
          sortOrder: 1,
          style: null,
          createdAt: '2026-04-22T00:00:00Z',
          updatedAt: '2026-04-22T00:00:00Z',
          mediaItems: [],
        },
      ],
      edges: [],
    },
    createdAt: '2026-04-22T00:00:00Z',
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  initHistoryStore('draft-1');
});

afterEach(() => {
  destroyHistoryStore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── push ───────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('adds a snapshot to the stack', () => {
    push(makeSnapshot('s1'));
    expect(getHistorySize()).toBe(1);
    expect(getHistoryCursor()).toBe(0);
  });

  it('caps the stack at MAX_HISTORY_SIZE when more snapshots are pushed', () => {
    for (let i = 0; i < MAX_HISTORY_SIZE + 5; i++) {
      push(makeSnapshot(`s${i}`));
    }
    expect(getHistorySize()).toBe(MAX_HISTORY_SIZE);
    expect(getHistoryCursor()).toBe(MAX_HISTORY_SIZE - 1);
  });

  it('discards forward history when a new snapshot is pushed after undo', () => {
    push(makeSnapshot('s1'));
    push(makeSnapshot('s2'));
    push(makeSnapshot('s3'));
    // Undo twice: cursor at index 0 (s1)
    undo();
    undo();
    expect(getHistoryCursor()).toBe(0);

    // Push a new snapshot — s2 and s3 should be discarded.
    push(makeSnapshot('s4'));
    expect(getHistorySize()).toBe(2); // s1 + s4
    expect(getHistoryCursor()).toBe(1);
  });

  it('schedules server persistence after a push', async () => {
    push(makeSnapshot('s1'));
    // persistHistorySnapshot is debounced at 1s; advance past the debounce.
    await vi.advanceTimersByTimeAsync(1001);
    expect(vi.mocked(persistHistorySnapshot)).toHaveBeenCalledTimes(1);
  });
});

// ── undo ──────────────────────────────────────────────────────────────────────

describe('undo', () => {
  it('moves cursor back by one', () => {
    push(makeSnapshot('s1'));
    push(makeSnapshot('s2'));
    expect(getHistoryCursor()).toBe(1);
    undo();
    expect(getHistoryCursor()).toBe(0);
  });

  it('is a no-op when cursor is at the bottom (index 0)', () => {
    push(makeSnapshot('s1'));
    undo(); // cursor to -1 is not allowed; at index 0 — no-op
    expect(getHistoryCursor()).toBe(0);
    undo(); // still at 0
    expect(getHistoryCursor()).toBe(0);
  });

  it('is a no-op when the stack is empty (cursor = -1)', () => {
    // Stack is empty after initHistoryStore
    undo();
    expect(getHistoryCursor()).toBe(-1);
    expect(getHistorySize()).toBe(0);
  });
});

// ── redo ──────────────────────────────────────────────────────────────────────

describe('redo', () => {
  it('moves cursor forward by one after undo', () => {
    push(makeSnapshot('s1'));
    push(makeSnapshot('s2'));
    undo();
    expect(getHistoryCursor()).toBe(0);
    redo();
    expect(getHistoryCursor()).toBe(1);
  });

  it('is a no-op when cursor is already at the top', () => {
    push(makeSnapshot('s1'));
    push(makeSnapshot('s2'));
    redo(); // already at top — no-op
    expect(getHistoryCursor()).toBe(1);
  });

  it('is a no-op when the stack is empty', () => {
    redo();
    expect(getHistoryCursor()).toBe(-1);
  });

  it('allows multiple undo/redo cycles', () => {
    push(makeSnapshot('s1'));
    push(makeSnapshot('s2'));
    push(makeSnapshot('s3'));

    undo(); // cursor 1
    undo(); // cursor 0
    redo(); // cursor 1
    redo(); // cursor 2
    redo(); // no-op — still 2

    expect(getHistoryCursor()).toBe(2);
  });
});

// ── loadServerHistory ──────────────────────────────────────────────────────────

describe('loadServerHistory', () => {
  it('seeds the stack with server snapshots and sets cursor to the top', () => {
    const serverSnaps = [makeServerSnapshot('a'), makeServerSnapshot('b'), makeServerSnapshot('c')];
    loadServerHistory(serverSnaps);
    expect(getHistorySize()).toBe(3);
    expect(getHistoryCursor()).toBe(2);
  });

  it('is a no-op when given an empty array', () => {
    loadServerHistory([]);
    expect(getHistorySize()).toBe(0);
    expect(getHistoryCursor()).toBe(-1);
  });

  it('trims to MAX_HISTORY_SIZE when given more than the cap', () => {
    const serverSnaps = Array.from({ length: MAX_HISTORY_SIZE + 10 }, (_, i) =>
      makeServerSnapshot(`s${i}`),
    );
    loadServerHistory(serverSnaps);
    expect(getHistorySize()).toBe(MAX_HISTORY_SIZE);
    expect(getHistoryCursor()).toBe(MAX_HISTORY_SIZE - 1);
  });
});

// ── Snapshot payload and restoration tests moved to storyboard-history-store.snapshot-payload.test.ts ──
// (Split to keep this file under 300-line cap per §9.1 — includes sentinel draggable + ST2 thumbnail tests)
