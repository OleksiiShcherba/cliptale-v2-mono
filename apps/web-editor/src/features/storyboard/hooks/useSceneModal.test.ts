/**
 * Tests for useSceneModal.
 *
 * Covers:
 * - openModal: sets editingBlock
 * - handleClose: clears editingBlock
 * - handleDelete: calls removeBlock and clears editingBlock
 * - handleSave: calls updateBlock with correct patch, clears editingBlock
 * - handleSave: calls setNodes with a function that patches data.block in-place
 * - handleSave: does NOT mutate nodes for non-matching node ids
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockUpdateBlock, mockRemoveBlock } = vi.hoisted(() => ({
  mockUpdateBlock: vi.fn(),
  mockRemoveBlock: vi.fn(),
}));

vi.mock('../store/storyboard-store', () => ({
  updateBlock: mockUpdateBlock,
  removeBlock: mockRemoveBlock,
}));

import { useSceneModal } from './useSceneModal';
import type { StoryboardBlock } from '../types';
import type { Node } from '@xyflow/react';

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

function makeSavePayload(overrides: Partial<{
  name: string;
  prompt: string;
  durationS: number;
  style: string | null;
  mediaItems: Array<{ fileId: string; mediaType: 'image' | 'video' | 'audio'; filename: string; sortOrder: number }>;
}> = {}) {
  return {
    name: 'Updated Scene',
    prompt: 'New prompt',
    durationS: 20,
    style: 'cyberpunk' as string | null,
    mediaItems: [] as Array<{ fileId: string; mediaType: 'image' | 'video' | 'audio'; filename: string; sortOrder: number }>,
    ...overrides,
  };
}

function makeFlowNode(blockOverrides: Partial<StoryboardBlock> = {}): Node {
  const block = makeBlock(blockOverrides);
  return {
    id: block.id,
    type: 'scene-block',
    position: { x: block.positionX, y: block.positionY },
    data: { block, onRemove: vi.fn() },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSceneModal', () => {
  let mockSetNodes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetNodes = vi.fn();
  });

  describe('openModal', () => {
    it('should set editingBlock when openModal is called', () => {
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

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
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

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
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

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
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

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

    it('should call setNodes after updateBlock to patch data.block in-place', () => {
      const { result } = renderHook(() => useSceneModal(mockSetNodes));
      const existingNode = makeFlowNode();

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload({ prompt: 'Updated prompt' }));
      });

      // setNodes must be called exactly once with a mapper function.
      expect(mockSetNodes).toHaveBeenCalledOnce();

      // Extract and invoke the updater function to verify it patches correctly.
      const updater = mockSetNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
      const nextNodes = updater([existingNode]);

      expect(nextNodes).toHaveLength(1);
      const updatedData = nextNodes[0].data as { block: StoryboardBlock };
      expect(updatedData.block.prompt).toBe('Updated prompt');
      expect(updatedData.block.name).toBe('Updated Scene');
      expect(updatedData.block.durationS).toBe(20);
    });

    it('should not mutate nodes whose id does not match blockId', () => {
      const { result } = renderHook(() => useSceneModal(mockSetNodes));
      const otherNode = makeFlowNode({ id: 'block-other', prompt: 'Original prompt' });

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave('block-1', makeSavePayload({ prompt: 'Changed prompt' }));
      });

      const updater = mockSetNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
      const nextNodes = updater([otherNode]);

      // The other node must be returned unchanged.
      expect(nextNodes[0]).toBe(otherNode);
    });

    it('should map empty name string to null in the patch', () => {
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

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
      const { result } = renderHook(() => useSceneModal(mockSetNodes));

      act(() => {
        result.current.openModal(makeBlock());
      });

      act(() => {
        result.current.handleSave(
          'block-1',
          makeSavePayload({
            mediaItems: [
              { fileId: 'file-a', mediaType: 'image', filename: 'a.jpg', sortOrder: 0 },
              { fileId: 'file-b', mediaType: 'video', filename: 'b.mp4', sortOrder: 1 },
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
