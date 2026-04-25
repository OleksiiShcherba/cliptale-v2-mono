/**
 * Tests for useSceneModal.
 *
 * Covers:
 * - openModal: sets editingBlock
 * - handleClose: clears editingBlock
 * - handleDelete: calls removeBlock and clears editingBlock
 * - handleSave: calls updateBlock, clears editingBlock, and immediately calls
 *   saveStoryboard (Bug 3 fix: immediate save after scene edit)
 * - handleSave: does NOT call saveStoryboard when draftId is empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockUpdateBlock, mockRemoveBlock, mockGetSnapshot, mockSaveStoryboard } = vi.hoisted(() => ({
  mockUpdateBlock: vi.fn(),
  mockRemoveBlock: vi.fn(),
  mockGetSnapshot: vi.fn(() => ({
    nodes: [
      {
        id: 'block-1',
        type: 'scene-block',
        position: { x: 100, y: 200 },
        data: {
          block: {
            id: 'block-1',
            draftId: 'draft-1',
            blockType: 'scene',
            name: 'Scene A',
            prompt: 'A prompt',
            durationS: 10,
            positionX: 100,
            positionY: 200,
            sortOrder: 1,
            style: null,
            createdAt: '',
            updatedAt: '',
            mediaItems: [],
          },
        },
      },
    ],
    edges: [],
    positions: {},
    selectedBlockId: null,
  })),
  mockSaveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../store/storyboard-store', () => ({
  updateBlock: mockUpdateBlock,
  removeBlock: mockRemoveBlock,
  getSnapshot: mockGetSnapshot,
}));

vi.mock('../api', () => ({
  saveStoryboard: mockSaveStoryboard,
}));

import { useSceneModal } from './useSceneModal';
import type { StoryboardBlock } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Scene A',
    prompt: 'A dramatic opening',
    durationS: 15,
    positionX: 100,
    positionY: 200,
    sortOrder: 1,
    style: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mediaItems: [],
    ...overrides,
  };
}

function makeSavePayload(overrides = {}) {
  return {
    name: 'Updated Scene',
    prompt: 'New prompt',
    durationS: 20,
    style: 'cyberpunk',
    mediaItems: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSceneModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openModal', () => {
    it('should set editingBlock when openModal is called', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      expect(result.current.editingBlock).toBeNull();

      act(() => {
        result.current.openModal(makeBlock());
      });

      expect(result.current.editingBlock).not.toBeNull();
      expect(result.current.editingBlock?.id).toBe('block-1');
    });
  });

  describe('handleClose', () => {
    it('should clear editingBlock when handleClose is called', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });
      expect(result.current.editingBlock).not.toBeNull();

      act(() => {
        result.current.handleClose();
      });
      expect(result.current.editingBlock).toBeNull();
    });
  });

  describe('handleDelete', () => {
    it('should call removeBlock with blockId and clear editingBlock', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleDelete('block-1');
      });

      expect(mockRemoveBlock).toHaveBeenCalledOnce();
      expect(mockRemoveBlock).toHaveBeenCalledWith('block-1');
      expect(result.current.editingBlock).toBeNull();
    });
  });

  describe('handleSave', () => {
    it('should call updateBlock with the correct patch and clear editingBlock', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload());
      });

      expect(mockUpdateBlock).toHaveBeenCalledOnce();
      const [calledId, patch] = mockUpdateBlock.mock.calls[0] as [string, Record<string, unknown>];
      expect(calledId).toBe('block-1');
      expect(patch.name).toBe('Updated Scene');
      expect(patch.prompt).toBe('New prompt');
      expect(patch.durationS).toBe(20);
      expect(result.current.editingBlock).toBeNull();
    });

    it('should immediately call saveStoryboard after updateBlock (Bug 3 fix)', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload());
      });

      // saveStoryboard should have been called once with draftId and a StoryboardState
      expect(mockSaveStoryboard).toHaveBeenCalledOnce();
      const [draftIdArg, stateArg] = mockSaveStoryboard.mock.calls[0] as [string, { blocks: unknown[]; edges: unknown[] }];
      expect(draftIdArg).toBe('draft-1');
      expect(Array.isArray(stateArg.blocks)).toBe(true);
      expect(Array.isArray(stateArg.edges)).toBe(true);
    });

    it('should NOT call saveStoryboard when draftId is empty string', () => {
      const { result } = renderHook(() => useSceneModal(''));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload());
      });

      // updateBlock should still run, but saveStoryboard should not
      expect(mockUpdateBlock).toHaveBeenCalledOnce();
      expect(mockSaveStoryboard).not.toHaveBeenCalled();
    });

    it('should map empty name string to null in the patch', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload({ name: '' }));
      });

      const [, patch] = mockUpdateBlock.mock.calls[0] as [string, Record<string, unknown>];
      expect(patch.name).toBeNull();
    });

    it('should map mediaItems with sequential IDs derived from blockId', () => {
      const { result } = renderHook(() => useSceneModal('draft-1'));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave(
          'block-1',
          makeSavePayload({
            mediaItems: [
              { fileId: 'file-a', mediaType: 'image', sortOrder: 0 },
              { fileId: 'file-b', mediaType: 'video', sortOrder: 1 },
            ],
          }),
        );
      });

      const [, patch] = mockUpdateBlock.mock.calls[0] as [string, { mediaItems: Array<{ id: string }> }];
      expect(patch.mediaItems[0].id).toBe('block-1-media-0');
      expect(patch.mediaItems[1].id).toBe('block-1-media-1');
    });
  });
});
