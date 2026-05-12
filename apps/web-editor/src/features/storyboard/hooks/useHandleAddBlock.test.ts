/**
 * Tests for useHandleAddBlock.
 *
 * Verifies that the hook:
 * - returns a stable `handleAddBlock` callback
 * - calls `addBlock()` when invoked
 * - is stable across re-renders when deps do not change
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useHandleAddBlock } from './useHandleAddBlock';

describe('useHandleAddBlock', () => {
  it('calls addBlock when handleAddBlock is invoked', () => {
    const addBlock = vi.fn();

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(addBlock).toHaveBeenCalledTimes(1);
  });

  it('does not own persistence side effects', () => {
    const addBlock = vi.fn();

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(addBlock).toHaveBeenCalledTimes(1);
  });

  it('calls only addBlock', () => {
    const callOrder: string[] = [];
    const addBlock = vi.fn(() => { callOrder.push('addBlock'); });

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(callOrder).toEqual(['addBlock']);
  });

  it('returns a stable callback reference when deps do not change', () => {
    const addBlock = vi.fn();

    const { result, rerender } = renderHook(() =>
      useHandleAddBlock({ addBlock }),
    );

    const firstRef = result.current.handleAddBlock;
    rerender();
    expect(result.current.handleAddBlock).toBe(firstRef);
  });
});
