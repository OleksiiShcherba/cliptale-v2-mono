/**
 * Snapshot payload and restoration tests for storyboard-history-store.
 *
 * Covers:
 * - applySnapshot behavior: sentinel nodes set to draggable during undo
 * - CanvasSnapshot accepts optional thumbnail/music fields and the stack is
 *   purely in-memory — push never persists to the server (AC-02, T14)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api module before importing the store so persistHistorySnapshot is never called.
const { mockPersistHistorySnapshot } = vi.hoisted(() => ({
  mockPersistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api', () => ({
  persistHistorySnapshot: mockPersistHistorySnapshot,
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
import { setNodes } from './storyboard-store';

const MUSIC_BLOCK = {
  id: '00000000-0000-4000-8000-000000000001',
  draftId: '00000000-0000-4000-8000-000000000010',
  name: 'Opening music',
  sourceMode: 'generate_on_step3' as const,
  prompt: null,
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: '00000000-0000-4000-8000-000000000020',
  endSceneBlockId: '00000000-0000-4000-8000-000000000021',
  positionX: 120,
  positionY: 520,
  sortOrder: 0,
  volume: 0.8,
  fadeInS: 0,
  fadeOutS: 1,
  loopMode: 'trim' as const,
  generationStatus: null,
  generationJobId: null,
  outputFileId: null,
  errorMessage: null,
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-05-26T00:00:00Z',
};

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
          videoPrompt: null,
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
          videoPrompt: null,
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

  it('accepts a thumbnail field and never persists it to the server (AC-02)', async () => {
    const thumbnail = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
    const snapWithThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
      thumbnail,
    };

    push(snapWithThumb);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(getHistorySize()).toBe(1);
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
  });

  it('keeps music blocks on the in-memory stack without a server call (AC-02)', async () => {
    const snapWithMusic: CanvasSnapshot = {
      blocks: [],
      edges: [],
      musicBlocks: [MUSIC_BLOCK],
    };

    push(snapWithMusic);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(getHistorySize()).toBe(1);
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
  });

  it('returns snapshot music blocks when undo applies a snapshot', () => {
    const snapWithMusic: CanvasSnapshot = {
      blocks: [],
      edges: [],
      musicBlocks: [MUSIC_BLOCK],
    };
    const snapWithoutMusic: CanvasSnapshot = {
      blocks: [],
      edges: [],
      musicBlocks: [],
    };

    push(snapWithMusic);
    push(snapWithoutMusic);

    const applied = undo();

    expect(applied?.musicBlocks).toEqual([MUSIC_BLOCK]);
  });

  it('a thumbnail-less snapshot also stays purely in memory (AC-02)', async () => {
    const snapNoThumb: CanvasSnapshot = {
      blocks: [],
      edges: [],
    };

    push(snapNoThumb);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(getHistorySize()).toBe(1);
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
  });
});
