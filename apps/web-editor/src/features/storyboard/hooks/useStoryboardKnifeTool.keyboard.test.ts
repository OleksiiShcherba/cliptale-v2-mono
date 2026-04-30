/**
 * Tests for useStoryboardKnifeTool — keyboard listener lifecycle.
 *
 * Covers:
 * - keydown and keyup listeners are added on mount.
 * - keydown and keyup listeners are removed on unmount (no leak).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useStoryboardKnifeTool } from './useStoryboardKnifeTool';

describe('useStoryboardKnifeTool — listener lifecycle', () => {
  it('adds keydown and keyup listeners on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    const { unmount } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges: vi.fn(),
        pushSnapshot: vi.fn().mockResolvedValue(undefined),
        saveNow: vi.fn().mockResolvedValue(undefined),
      }),
    );

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('keyup', expect.any(Function));

    unmount();
    vi.restoreAllMocks();
  });

  it('removes keydown and keyup listeners on unmount (no leak)', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useStoryboardKnifeTool({
        nodes: [],
        setEdges: vi.fn(),
        pushSnapshot: vi.fn().mockResolvedValue(undefined),
        saveNow: vi.fn().mockResolvedValue(undefined),
      }),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));

    vi.restoreAllMocks();
  });
});
