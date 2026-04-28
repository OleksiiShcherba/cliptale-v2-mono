/**
 * Snapshot payload and restoration tests for storyboard-history-store.
 *
 * Covers:
 * - applySnapshot behavior: sentinel nodes set to draggable during undo
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
  initHistoryStore,
  destroyHistoryStore,
  getHistorySize,
  getHistoryCursor,
} from './storyboard-history-store';
import type { CanvasSnapshot } from './storyboard-history-store';
import type { StoryboardHistoryPayload } from '../api';
import { persistHistorySnapshot } from '../api';
import { setNodes } from './storyboard-store';

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

// ── sentinel draggable after undo ──────────────────────────────────────────────

describe('applySnapshot (via undo) — sentinel node draggable', () => {
  function makeSnapshotWithSentinels(): CanvasSnapshot {
    return {
      blocks: [
        {
          id: 'block-start',
          draftId: 'draft-1',
          blockType: 'start',
          name: 'START',
          prompt: null,
          durationS: 0,
          positionX: 60,
          positionY: 200,
          sortOrder: 0,
          style: null,
          createdAt: '2026-04-24T00:00:00Z',
          updatedAt: '2026-04-24T00:00:00Z',
          mediaItems: [],
        },
        {
          id: 'block-end',
          draftId: 'draft-1',
          blockType: 'end',
          name: 'END',
          prompt: null,
          durationS: 0,
          positionX: 620,
          positionY: 200,
          sortOrder: 99,
          style: null,
          createdAt: '2026-04-24T00:00:00Z',
          updatedAt: '2026-04-24T00:00:00Z',
          mediaItems: [],
        },
      ],
      edges: [],
      positions: {
        'block-start': { x: 60, y: 200 },
        'block-end': { x: 620, y: 200 },
      },
    };
  }

  it('passes draggable: true for START sentinel to setNodes after undo', () => {
    const snap1 = makeSnapshotWithSentinels();
    // Add a second snapshot so undo has somewhere to go.
    const snap2 = makeSnapshotWithSentinels();
    push(snap1);
    push(snap2);

    undo();

    const setNodesMock = vi.mocked(setNodes);
    expect(setNodesMock).toHaveBeenCalled();
    const calledWith = setNodesMock.mock.calls[setNodesMock.mock.calls.length - 1][0];
    const startNode = calledWith.find((n) => n.id === 'block-start');
    expect(startNode).toBeDefined();
    expect(startNode?.draggable).toBe(true);
    // deletable must remain false for sentinel nodes.
    expect(startNode?.deletable).toBe(false);
  });

  it('passes draggable: true for END sentinel to setNodes after undo', () => {
    const snap1 = makeSnapshotWithSentinels();
    const snap2 = makeSnapshotWithSentinels();
    push(snap1);
    push(snap2);

    undo();

    const setNodesMock = vi.mocked(setNodes);
    expect(setNodesMock).toHaveBeenCalled();
    const calledWith = setNodesMock.mock.calls[setNodesMock.mock.calls.length - 1][0];
    const endNode = calledWith.find((n) => n.id === 'block-end');
    expect(endNode).toBeDefined();
    expect(endNode?.draggable).toBe(true);
    // deletable must remain false for sentinel nodes.
    expect(endNode?.deletable).toBe(false);
  });
});

// ── ST2: CanvasSnapshot thumbnail field ─────────────────────────────────────────

describe('CanvasSnapshot thumbnail field (ST2)', () => {
  it('accepts a snapshot with thumbnail — TypeScript type is satisfied', () => {
    const snapWithThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
      positions: {},
      thumbnail: 'data:image/jpeg;base64,/9j/4AAQ',
    };

    push(snapWithThumb);
    expect(getHistorySize()).toBe(1);
    expect(getHistoryCursor()).toBe(0);
  });

  it('accepts a snapshot without thumbnail — thumbnail is optional', () => {
    const snapNoThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
    };

    push(snapNoThumb);
    expect(getHistorySize()).toBe(1);
  });

  it('forwards thumbnail to persistHistorySnapshot payload when present', async () => {
    const thumbnail = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
    const snapWithThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
      thumbnail,
    };

    push(snapWithThumb);
    await vi.advanceTimersByTimeAsync(1001);

    expect(vi.mocked(persistHistorySnapshot)).toHaveBeenCalledTimes(1);
    const [, calledPayload] = vi.mocked(persistHistorySnapshot).mock.calls[0] as [
      string,
      StoryboardHistoryPayload,
    ];
    expect(calledPayload.thumbnail).toBe(thumbnail);
  });

  it('omits thumbnail from persistHistorySnapshot payload when absent', async () => {
    const snapNoThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
    };

    push(snapNoThumb);
    await vi.advanceTimersByTimeAsync(1001);

    expect(vi.mocked(persistHistorySnapshot)).toHaveBeenCalledTimes(1);
    const [, calledPayload] = vi.mocked(persistHistorySnapshot).mock.calls[0] as [
      string,
      StoryboardHistoryPayload,
    ];
    expect(calledPayload.thumbnail).toBeUndefined();
  });
});
