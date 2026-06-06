/**
 * In-memory undo/redo stack for storyboard canvas snapshots.
 *
 * Server persistence was REMOVED here (storyboard-autosave-checkpoints T14,
 * AC-02): the lightweight per-change path never creates History entries.
 * History entries are now pushed ONLY by the checkpoint scheduler / manual
 * Save / pre-restore checkpoint via the checkpoint push client (T9).
 */

import type { Node, Edge } from '@xyflow/react';

import type { StoryboardHistorySnapshot } from '@/features/storyboard/api';
import { BORDER } from '@/features/storyboard/components/nodeStyles';
import type { StoryboardState } from '@/features/storyboard/types';
import {
  musicBlockToNode,
  orderStoryboardSceneBlocks,
} from '@/features/storyboard/hooks/useStoryboardMusic';

import { setNodes, setEdges, getSnapshot } from './storyboard-store';
import type { AppliedCanvasSnapshot, CanvasSnapshot } from './storyboard-history-types';

export type { AppliedCanvasSnapshot, CanvasSnapshot } from './storyboard-history-types';

export const MAX_HISTORY_SIZE = 50;

// ── Types ──────────────────────────────────────────────────────────────────────

/** Public interface that `useStoryboardKeyboard` and other consumers depend on. */
export type StoryboardHistoryStore = {
  /** Reverts the canvas to the previous snapshot. No-op if at the bottom of the stack. */
  undo: () => AppliedCanvasSnapshot | null;
  /** Re-applies the next snapshot. No-op if at the top of the stack. */
  redo: () => AppliedCanvasSnapshot | null;
};

// ── Store state ────────────────────────────────────────────────────────────────

/** The undo/redo stack — index 0 is the oldest; top = stack.length - 1. */
let stack: CanvasSnapshot[] = [];
/** Points to the snapshot that currently represents the canvas state. */
let cursor = -1;


/**
 * Restores the canvas to the snapshot at `cursor`.
 * Converts the snapshot back to React Flow nodes/edges and calls store setters.
 * The storyboard-store holds the current React Flow nodes; we reconstruct minimal
 * Node objects from the snapshot positions and existing node metadata.
 */
function applySnapshot(snapshot: CanvasSnapshot): AppliedCanvasSnapshot {
  const { nodes: currentNodes } = getSnapshot();

  // Rebuild nodes: preserve all React Flow node metadata but override position.
  const restoredBlockNodes: Node[] = snapshot.blocks.map((block) => {
    const existing = currentNodes.find((n) => n.id === block.id);
    const pos = snapshot.positions?.[block.id] ?? { x: block.positionX, y: block.positionY };

    if (existing) {
      return { ...existing, position: pos };
    }

    // Node no longer in canvas (was deleted) — reconstruct minimal shape.
    return {
      id: block.id,
      type: block.blockType === 'start' ? 'start'
        : block.blockType === 'end' ? 'end'
        : 'scene-block',
      position: pos,
      data: block.blockType === 'scene'
        ? { block, onRemove: () => undefined }
        : { label: block.blockType.toUpperCase() },
      draggable: true,
      deletable: block.blockType === 'scene',
    };
  });

  // Rebuild edges from snapshot.
  const restoredEdges: Edge[] = snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: 'exit',
    target: edge.targetBlockId,
    targetHandle: 'income',
    style: { stroke: BORDER, strokeWidth: 2 },
  }));

  const orderedScenes = orderStoryboardSceneBlocks(snapshot.blocks, snapshot.edges);
  const restoredMusicNodes = (snapshot.musicBlocks ?? []).map((musicBlock) =>
    musicBlockToNode(musicBlock, orderedScenes as StoryboardState['blocks']),
  );
  const restoredNodes = [...restoredBlockNodes, ...restoredMusicNodes];

  setNodes(restoredNodes);
  setEdges(restoredEdges);

  return {
    nodes: restoredNodes,
    edges: restoredEdges,
    ...(snapshot.musicBlocks !== undefined && { musicBlocks: snapshot.musicBlocks }),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialises the history store for a specific draft.
 * Must be called on page mount before any `push` calls.
 */
export function initHistoryStore(_id: string): void {
  stack = [];
  cursor = -1;
}

/**
 * Tears down the history store (cancel pending timers, clear state).
 * Call on page unmount.
 */
export function destroyHistoryStore(): void {
  stack = [];
  cursor = -1;
}

/**
 * Seeds the in-memory stack from server-persisted snapshots.
 * Called on page mount after `GET /storyboards/:draftId/history` resolves.
 * Existing stack content is replaced.
 */
export function loadServerHistory(snapshots: StoryboardHistorySnapshot[]): void {
  if (!snapshots.length) return;

  // Convert server snapshots to CanvasSnapshot format.
  stack = snapshots.slice(-MAX_HISTORY_SIZE).map((s) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const block of s.snapshot.blocks) {
      positions[block.id] = { x: block.positionX, y: block.positionY };
    }
    return {
      blocks: s.snapshot.blocks,
      edges: s.snapshot.edges,
      ...(s.snapshot.musicBlocks !== undefined && { musicBlocks: s.snapshot.musicBlocks }),
      positions,
    };
  });

  // Cursor points to the latest (most recent) snapshot.
  cursor = stack.length - 1;
}

/**
 * Returns the current stack length. Used primarily by tests.
 */
export function getHistorySize(): number {
  return stack.length;
}

/**
 * Returns the current cursor index. Used primarily by tests.
 */
export function getHistoryCursor(): number {
  return cursor;
}

/**
 * Pushes a new canvas snapshot onto the IN-MEMORY undo stack.
 *
 * - If cursor is not at the top (user undid then mutated), the forward history
 *   is discarded first.
 * - The stack is capped at MAX_HISTORY_SIZE; oldest is dropped when exceeded.
 * - Never touches the server (AC-02): History entries are created only by the
 *   checkpoint push client.
 */
export async function push(snapshot: CanvasSnapshot): Promise<void> {
  // Discard redo history after a new mutation.
  if (cursor < stack.length - 1) {
    stack = stack.slice(0, cursor + 1);
  }

  stack.push(snapshot);

  // Enforce cap — drop the oldest snapshot.
  if (stack.length > MAX_HISTORY_SIZE) {
    stack = stack.slice(stack.length - MAX_HISTORY_SIZE);
  }

  cursor = stack.length - 1;
}

/**
 * Reverts the canvas to the previous snapshot.
 * No-op if the cursor is already at the bottom of the stack (nothing to undo).
 */
export function undo(): AppliedCanvasSnapshot | null {
  if (cursor <= 0) return null;
  cursor -= 1;
  return applySnapshot(stack[cursor]);
}

/**
 * Re-applies the next snapshot after an undo.
 * No-op if the cursor is already at the top of the stack (nothing to redo).
 */
export function redo(): AppliedCanvasSnapshot | null {
  if (cursor >= stack.length - 1) return null;
  cursor += 1;
  return applySnapshot(stack[cursor]);
}

/**
 * The history store object — satisfies the `StoryboardHistoryStore` interface
 * expected by `useStoryboardKeyboard`.
 */
export const storyboardHistoryStore: StoryboardHistoryStore = {
  undo,
  redo,
};
