import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useTrackReorder } from './useTrackReorder';

const TRACK_IDS = ['track-1', 'track-2', 'track-3', 'track-4'];

describe('useTrackReorder', () => {
  it('initialises with no drag state', () => {
    const { result } = renderHook(() => useTrackReorder());
    expect(result.current.reorderState.draggingId).toBeNull();
    expect(result.current.reorderState.overTargetId).toBeNull();
  });

  it('sets draggingId when onDragStart is called', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
    });

    expect(result.current.reorderState.draggingId).toBe('track-1');
    expect(result.current.reorderState.overTargetId).toBeNull();
  });

  it('sets overTargetId when onDragOver is called', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
      result.current.onDragOver('track-3');
    });

    expect(result.current.reorderState.overTargetId).toBe('track-3');
  });

  it('clears overTargetId when onDragLeave is called for the current target', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
      result.current.onDragOver('track-3');
    });

    act(() => {
      result.current.onDragLeave('track-3');
    });

    expect(result.current.reorderState.overTargetId).toBeNull();
  });

  it('does not clear overTargetId when onDragLeave is called for a different track', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
      result.current.onDragOver('track-3');
    });

    act(() => {
      result.current.onDragLeave('track-2');
    });

    // overTargetId should remain track-3 since we left track-2, not track-3
    expect(result.current.reorderState.overTargetId).toBe('track-3');
  });

  it('resets all state when onDragEnd is called', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
      result.current.onDragOver('track-3');
    });

    act(() => {
      result.current.onDragEnd();
    });

    expect(result.current.reorderState.draggingId).toBeNull();
    expect(result.current.reorderState.overTargetId).toBeNull();
  });

  describe('onDrop', () => {
    it('returns null when no drag is in progress', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toBeNull();
    });

    it('returns null when dragging onto the same track', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-1');
        result.current.onDragOver('track-1');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toBeNull();
    });

    it('returns null when target is not in the track list', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-1');
        result.current.onDragOver('track-999');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toBeNull();
    });

    it('moves track from index 0 to index 2 (drag down)', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-1');
        result.current.onDragOver('track-3');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toEqual(['track-2', 'track-3', 'track-1', 'track-4']);
    });

    it('moves track from index 3 to index 0 (drag up)', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-4');
        result.current.onDragOver('track-1');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toEqual(['track-4', 'track-1', 'track-2', 'track-3']);
    });

    it('moves track from index 1 to index 3 (drag to last)', () => {
      const { result } = renderHook(() => useTrackReorder());
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-2');
        result.current.onDragOver('track-4');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(newOrder).toEqual(['track-1', 'track-3', 'track-4', 'track-2']);
    });

    it('resets state to null after a successful drop', () => {
      const { result } = renderHook(() => useTrackReorder());

      act(() => {
        result.current.onDragStart('track-1');
        result.current.onDragOver('track-3');
      });

      act(() => {
        result.current.onDrop(TRACK_IDS);
      });

      expect(result.current.reorderState.draggingId).toBeNull();
      expect(result.current.reorderState.overTargetId).toBeNull();
    });

    it('resets state after a cancelled drop (same track)', () => {
      const { result } = renderHook(() => useTrackReorder());

      act(() => {
        result.current.onDragStart('track-2');
        result.current.onDragOver('track-2');
      });

      act(() => {
        result.current.onDrop(TRACK_IDS);
      });

      expect(result.current.reorderState.draggingId).toBeNull();
    });

    it('does not mutate the original track ids array', () => {
      const { result } = renderHook(() => useTrackReorder());
      const original = [...TRACK_IDS];
      let newOrder: string[] | null = undefined as unknown as string[] | null;

      act(() => {
        result.current.onDragStart('track-1');
        result.current.onDragOver('track-3');
      });

      act(() => {
        newOrder = result.current.onDrop(TRACK_IDS);
      });

      expect(TRACK_IDS).toEqual(original);
      expect(newOrder).not.toBe(TRACK_IDS);
    });
  });

  it('onDragOver is idempotent — does not cause redundant state updates for the same target', () => {
    const { result } = renderHook(() => useTrackReorder());

    act(() => {
      result.current.onDragStart('track-1');
      result.current.onDragOver('track-3');
    });

    const stateAfterFirst = result.current.reorderState;

    act(() => {
      result.current.onDragOver('track-3');
    });

    // Same reference means no state update occurred (React bails out on same reference)
    expect(result.current.reorderState).toBe(stateAfterFirst);
  });
});
