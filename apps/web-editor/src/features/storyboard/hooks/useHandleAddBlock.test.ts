/**
 * Tests for useHandleAddBlock.
 *
 * Verifies that the hook:
 * - returns a stable `handleAddBlock` callback
 * - calls `addBlock()` when invoked
 * - calls `saveNow()` when invoked
 * - is stable across re-renders when deps do not change
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useHandleAddBlock } from './useHandleAddBlock';

describe('useHandleAddBlock', () => {
  it('calls addBlock when handleAddBlock is invoked', () => {
    const addBlock = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock, saveNow }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(addBlock).toHaveBeenCalledTimes(1);
  });

  it('calls saveNow when handleAddBlock is invoked', () => {
    const addBlock = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock, saveNow }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
  });

  it('calls addBlock before saveNow', () => {
    const callOrder: string[] = [];
    const addBlock = vi.fn(() => { callOrder.push('addBlock'); });
    const saveNow = vi.fn(() => { callOrder.push('saveNow'); return Promise.resolve(); });

    const { result } = renderHook(() =>
      useHandleAddBlock({ addBlock, saveNow }),
    );

    act(() => {
      result.current.handleAddBlock();
    });

    expect(callOrder).toEqual(['addBlock', 'saveNow']);
  });

  it('returns a stable callback reference when deps do not change', () => {
    const addBlock = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(() =>
      useHandleAddBlock({ addBlock, saveNow }),
    );

    const firstRef = result.current.handleAddBlock;
    rerender();
    expect(result.current.handleAddBlock).toBe(firstRef);
  });
});
