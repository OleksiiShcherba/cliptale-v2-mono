/**
 * Tests for useStoryboardCanvas.
 *
 * Covers:
 * - On mount: calls fetchStoryboard (GET) only.
 * - Client-side dedup: duplicate START/END blocks are filtered, keeping the first.
 * - All scene blocks are preserved regardless of dedup.
 * - Happy path: blocks and edges are mapped to React Flow nodes/edges.
 * - Error path: fetchStoryboard failure sets error state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import type { StoryboardState } from '../types';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockFetchStoryboard } = vi.hoisted(() => ({
  mockFetchStoryboard: vi.fn(),
}));

vi.mock('../api', () => ({
  fetchStoryboard: mockFetchStoryboard,
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { useStoryboardCanvas } from './useStoryboardCanvas';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<StoryboardState>): StoryboardState {
  return {
    blocks: [
      {
        id: 'start-1',
        draftId: 'draft-1',
        blockType: 'start',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 5,
        positionX: 50,
        positionY: 300,
        sortOrder: 0,
        style: null,
        mediaItems: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'end-1',
        draftId: 'draft-1',
        blockType: 'end',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 5,
        positionX: 900,
        positionY: 300,
        sortOrder: 9999,
        style: null,
        mediaItems: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    edges: [],
    musicBlocks: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchStoryboard.mockResolvedValue(makeState());
  });

  it('calls fetchStoryboard (GET) on mount', async () => {
    renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => {
      expect(mockFetchStoryboard).toHaveBeenCalledOnce();
      expect(mockFetchStoryboard).toHaveBeenCalledWith('draft-1');
    });
  });

  it('maps blocks and edges to React Flow nodes and edges on success', async () => {
    const { result } = renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toHaveLength(0);
    expect(result.current.error).toBeNull();

    const nodeTypes = result.current.nodes.map((n) => n.type);
    expect(nodeTypes).toContain('start');
    expect(nodeTypes).toContain('end');
  });

  it('deduplicates duplicate START blocks — keeps only the first', async () => {
    const stateWithDuplicates: StoryboardState = {
      blocks: [
        {
          id: 'start-1',
          draftId: 'draft-1',
          blockType: 'start',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 50,
          positionY: 300,
          sortOrder: 0,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'start-2',
          draftId: 'draft-1',
          blockType: 'start',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 55,
          positionY: 305,
          sortOrder: 0,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'end-1',
          draftId: 'draft-1',
          blockType: 'end',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 900,
          positionY: 300,
          sortOrder: 9999,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'end-2',
          draftId: 'draft-1',
          blockType: 'end',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 905,
          positionY: 305,
          sortOrder: 9999,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      edges: [],
      musicBlocks: [],
    };
    mockFetchStoryboard.mockResolvedValue(stateWithDuplicates);

    const { result } = renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // After dedup: exactly 1 start + 1 end = 2 nodes total.
    expect(result.current.nodes).toHaveLength(2);

    const nodeTypes = result.current.nodes.map((n) => n.type);
    expect(nodeTypes.filter((t) => t === 'start')).toHaveLength(1);
    expect(nodeTypes.filter((t) => t === 'end')).toHaveLength(1);

    // The first start/end IDs are kept.
    const nodeIds = result.current.nodes.map((n) => n.id);
    expect(nodeIds).toContain('start-1');
    expect(nodeIds).toContain('end-1');
    expect(nodeIds).not.toContain('start-2');
    expect(nodeIds).not.toContain('end-2');
  });

  it('preserves all scene blocks when deduplicating sentinels', async () => {
    const stateWithScenes: StoryboardState = {
      blocks: [
        {
          id: 'start-1',
          draftId: 'draft-1',
          blockType: 'start',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 50,
          positionY: 300,
          sortOrder: 0,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'scene-1',
          draftId: 'draft-1',
          blockType: 'scene',
          name: 'Scene 1',
          prompt: null,
          videoPrompt: null,
          durationS: 10,
          positionX: 400,
          positionY: 300,
          sortOrder: 1,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'scene-2',
          draftId: 'draft-1',
          blockType: 'scene',
          name: 'Scene 2',
          prompt: null,
          videoPrompt: null,
          durationS: 10,
          positionX: 680,
          positionY: 300,
          sortOrder: 2,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'end-1',
          draftId: 'draft-1',
          blockType: 'end',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 900,
          positionY: 300,
          sortOrder: 9999,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      edges: [],
      musicBlocks: [],
    };
    mockFetchStoryboard.mockResolvedValue(stateWithScenes);

    const { result } = renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 1 start + 2 scenes + 1 end = 4 nodes.
    expect(result.current.nodes).toHaveLength(4);
  });

  it('maps hydrated music blocks to music React Flow nodes', async () => {
    const stateWithMusic: StoryboardState = {
      blocks: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          draftId: 'draft-1',
          blockType: 'start',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 50,
          positionY: 300,
          sortOrder: 0,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          draftId: 'draft-1',
          blockType: 'scene',
          name: 'Opening',
          prompt: null,
          videoPrompt: null,
          durationS: 10,
          positionX: 320,
          positionY: 300,
          sortOrder: 1,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000003',
          draftId: 'draft-1',
          blockType: 'end',
          name: null,
          prompt: null,
          videoPrompt: null,
          durationS: 5,
          positionX: 900,
          positionY: 300,
          sortOrder: 9999,
          style: null,
          mediaItems: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      edges: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          draftId: 'draft-1',
          sourceBlockId: '00000000-0000-4000-8000-000000000001',
          targetBlockId: '00000000-0000-4000-8000-000000000002',
        },
        {
          id: '00000000-0000-4000-8000-000000000011',
          draftId: 'draft-1',
          sourceBlockId: '00000000-0000-4000-8000-000000000002',
          targetBlockId: '00000000-0000-4000-8000-000000000003',
        },
      ],
      musicBlocks: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          draftId: 'draft-1',
          name: 'Opening music',
          sourceMode: 'generate_on_step3',
          prompt: 'Warm pulse',
          compositionPlan: null,
          existingFileId: null,
          startSceneBlockId: '00000000-0000-4000-8000-000000000002',
          endSceneBlockId: '00000000-0000-4000-8000-000000000002',
          positionX: 320,
          positionY: 520,
          sortOrder: 0,
          volume: 0.8,
          fadeInS: 0,
          fadeOutS: 1,
          loopMode: 'trim',
          generationStatus: null,
          generationJobId: null,
          outputFileId: null,
          errorMessage: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    mockFetchStoryboard.mockResolvedValue(stateWithMusic);

    const { result } = renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const musicNode = result.current.nodes.find((node) => node.type === 'music-block');
    expect(musicNode).toBeDefined();
    expect(musicNode?.position).toEqual({ x: 320, y: 520 });
    expect((musicNode?.data as { rangeLabel: string }).rangeLabel).toBe('Opening');
  });

  it('sets error state when fetchStoryboard throws', async () => {
    mockFetchStoryboard.mockRejectedValue(new Error('GET /storyboards/draft-1 failed: 500'));

    const { result } = renderHook(() => useStoryboardCanvas('draft-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('GET /storyboards/draft-1 failed: 500');
    expect(result.current.nodes).toHaveLength(0);
  });

  it('skips fetch when draftId is empty string', () => {
    renderHook(() => useStoryboardCanvas(''));

    expect(mockFetchStoryboard).not.toHaveBeenCalled();
  });
});
