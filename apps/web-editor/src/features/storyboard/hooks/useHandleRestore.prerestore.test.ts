/**
 * Tests for the pre-restore checkpoint in useHandleRestore
 * (storyboard-autosave-checkpoints T12, AC-12).
 *
 * Covers:
 * 1. A manual restore with changes newer than the latest checkpoint first
 *    pushes a checkpoint of the CURRENT canvas — before the canvas is replaced.
 * 2. A failed pre-restore push NEVER blocks the restore (AC-12 tail).
 * 3. No newer changes → no pre-restore checkpoint.
 * 4. Undo/redo (skipSnapshot) and the seed path (skipSave) never pre-push.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { useHandleRestore } from './useHandleRestore';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CURRENT_NODES: Node[] = [
  { id: 'cur-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
];
const CURRENT_EDGES: Edge[] = [{ id: 'cur-e1', source: 'cur-1', target: 'cur-1' }];

const RESTORED_NODES: Node[] = [
  { id: 'old-1', type: 'start', position: { x: 5, y: 5 }, data: {} },
];
const RESTORED_EDGES: Edge[] = [];

type HookArgs = Parameters<typeof useHandleRestore>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    pushSnapshot: vi.fn().mockResolvedValue(undefined),
    removeNode: vi.fn(),
    saveNow: vi.fn().mockResolvedValue(undefined),
    pushPreRestoreCheckpoint: vi.fn().mockResolvedValue(true),
    hasChangesSinceLastCheckpoint: vi.fn().mockReturnValue(true),
    getCurrentCanvas: vi.fn(() => ({ nodes: CURRENT_NODES, edges: CURRENT_EDGES })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useHandleRestore — pre-restore checkpoint (AC-12)', () => {
  it('pushes a checkpoint of the CURRENT canvas before replacing it', async () => {
    const order: string[] = [];
    const args = makeArgs({
      pushPreRestoreCheckpoint: vi.fn(async () => {
        order.push('pre-restore-push');
        return true;
      }),
      setNodes: vi.fn(() => order.push('setNodes')) as HookArgs['setNodes'],
    });

    const { result } = renderHook(() => useHandleRestore(args));
    await act(async () => {
      await result.current.handleRestore(RESTORED_NODES, RESTORED_EDGES);
    });

    expect(args.pushPreRestoreCheckpoint).toHaveBeenCalledWith(CURRENT_NODES, CURRENT_EDGES);
    expect(order).toEqual(['pre-restore-push', 'setNodes']);
  });

  it('a failed pre-restore push never blocks the restore', async () => {
    const args = makeArgs({
      pushPreRestoreCheckpoint: vi.fn().mockRejectedValue(new Error('network down')),
    });

    const { result } = renderHook(() => useHandleRestore(args));
    await act(async () => {
      await result.current.handleRestore(RESTORED_NODES, RESTORED_EDGES);
    });

    expect(args.setNodes).toHaveBeenCalledWith(RESTORED_NODES);
    expect(args.setEdges).toHaveBeenCalledWith(RESTORED_EDGES);
  });

  it('no changes newer than the last checkpoint → no pre-restore push', async () => {
    const args = makeArgs({
      hasChangesSinceLastCheckpoint: vi.fn().mockReturnValue(false),
    });

    const { result } = renderHook(() => useHandleRestore(args));
    await act(async () => {
      await result.current.handleRestore(RESTORED_NODES, RESTORED_EDGES);
    });

    expect(args.pushPreRestoreCheckpoint).not.toHaveBeenCalled();
    expect(args.setNodes).toHaveBeenCalled();
  });

  it('undo/redo (skipSnapshot) and the seed path (skipSave) never pre-push', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useHandleRestore(args));

    await act(async () => {
      await result.current.handleRestore(RESTORED_NODES, RESTORED_EDGES, { skipSnapshot: true });
    });
    await act(async () => {
      await result.current.handleRestore(RESTORED_NODES, RESTORED_EDGES, { skipSave: true });
    });

    expect(args.pushPreRestoreCheckpoint).not.toHaveBeenCalled();
  });
});
