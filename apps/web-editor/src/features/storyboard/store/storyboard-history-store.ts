/**
 * storyboard-history-store — undo/redo stack for the storyboard canvas.
 *
 * Holds up to MAX_HISTORY_SIZE snapshots of the canvas state. Each snapshot
 * contains only the graph structure (blocks and edges — NOT React Flow node
 * metadata or thumbnail data) to keep the payload small.
 *
 * Server persistence:
 * - Snapshots are pushed to `POST /storyboards/:draftId/history` asynchronously
 *   with a 1s debounce (fire-and-forget; errors are logged, never surfaced).
 * - On mount, `loadServerHistory` is called to seed the in-memory stack so
 *   undo works across browser sessions.
 *
 * Interface:
 * - `push(snapshot)` — add a new snapshot; drop oldest when cap exceeded.
 * - `undo()` — revert canvas to the previous snapshot.
 * - `redo()` — re-apply the next snapshot after an undo.
 * - `loadServerHistory(snapshots)` — seeds the stack from server data on mount.
 *
 * The `StoryboardHistoryStore` type is compatible with the stub in
 * `storyboard-history-store.stub.ts` (undo/redo signatures match).
 */

import type { Node, Edge } from '@xyflow/react';

import { persistHistorySnapshot } from '../api';
import type { StoryboardHistorySnapshot } from '../api';
import type { StoryboardState } from '../types';
import { BORDER } from '../components/nodeStyles';
import { setNodes, setEdges, getSnapshot } from './storyboard-store';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Maximum number of snapshots kept in memory. Oldest is dropped when exceeded. */
export const MAX_HISTORY_SIZE = 50;

/** Debounce delay (ms) for sending a snapshot to the server. */
const SERVER_PERSIST_DEBOUNCE_MS = 1000;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A lightweight canvas snapshot — graph structure only.
 * Excludes React Flow metadata (handles, measured dimensions, etc.) to stay small.
 */
export type CanvasSnapshot = {
  /** Serializable block data extracted from React Flow nodes. */
  blocks: StoryboardState['blocks'];
  /** Serializable edge data extracted from React Flow edges. */
  edges: StoryboardState['edges'];
  /** Node positions at the time of the snapshot. */
  positions: Record<string, { x: number; y: number }>;
};

/** Public interface that `useStoryboardKeyboard` and other consumers depend on. */
export type StoryboardHistoryStore = {
  /** Reverts the canvas to the previous snapshot. No-op if at the bottom of the stack. */
  undo: () => void;
  /** Re-applies the next snapshot. No-op if at the top of the stack. */
  redo: () => void;
};

// ── Store state ────────────────────────────────────────────────────────────────

/** The undo/redo stack — index 0 is the oldest; top = stack.length - 1. */
let stack: CanvasSnapshot[] = [];
/**
 * Points to the snapshot that currently represents the canvas state.
 * After a push: cursor = stack.length - 1 (top).
 * After undo: cursor decrements.
 * After redo: cursor increments.
 * Invariant: -1 means the stack is empty (nothing to undo).
 */
let cursor = -1;

/** draftId used for server persistence — set when `initHistoryStore` is called. */
let draftId = '';

/** Pending server-persist debounce timer handle. */
let persistTimerHandle: ReturnType<typeof setTimeout> | null = null;

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Schedules a fire-and-forget POST to the server.
 * Debounced at SERVER_PERSIST_DEBOUNCE_MS to coalesce rapid mutations.
 */
function schedulePersist(snapshot: CanvasSnapshot): void {
  if (!draftId) return;

  if (persistTimerHandle !== null) {
    clearTimeout(persistTimerHandle);
  }

  persistTimerHandle = setTimeout(() => {
    // Convert CanvasSnapshot back to StoryboardState for the API call.
    const serverState: StoryboardState = {
      blocks: snapshot.blocks,
      edges: snapshot.edges,
    };

    persistHistorySnapshot(draftId, serverState).catch((err: unknown) => {
      console.error('[storyboard-history-store] Failed to persist snapshot:', err);
    });
    persistTimerHandle = null;
  }, SERVER_PERSIST_DEBOUNCE_MS);
}

/**
 * Restores the canvas to the snapshot at `cursor`.
 * Converts the snapshot back to React Flow nodes/edges and calls store setters.
 * The storyboard-store holds the current React Flow nodes; we reconstruct minimal
 * Node objects from the snapshot positions and existing node metadata.
 */
function applySnapshot(snapshot: CanvasSnapshot): void {
  const { nodes: currentNodes } = getSnapshot();

  // Rebuild nodes: preserve all React Flow node metadata but override position.
  const restoredNodes: Node[] = snapshot.blocks.map((block) => {
    const existing = currentNodes.find((n) => n.id === block.id);
    const pos = snapshot.positions[block.id] ?? { x: block.positionX, y: block.positionY };

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
      draggable: block.blockType === 'scene',
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

  setNodes(restoredNodes);
  setEdges(restoredEdges);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialises the history store for a specific draft.
 * Must be called on page mount before any `push` calls.
 */
export function initHistoryStore(id: string): void {
  draftId = id;
  stack = [];
  cursor = -1;
  if (persistTimerHandle !== null) {
    clearTimeout(persistTimerHandle);
    persistTimerHandle = null;
  }
}

/**
 * Tears down the history store (cancel pending timers, clear state).
 * Call on page unmount.
 */
export function destroyHistoryStore(): void {
  if (persistTimerHandle !== null) {
    clearTimeout(persistTimerHandle);
    persistTimerHandle = null;
  }
  stack = [];
  cursor = -1;
  draftId = '';
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
 * Pushes a new canvas snapshot onto the history stack.
 *
 * - If cursor is not at the top (user undid then mutated), the forward history
 *   is discarded first.
 * - The stack is capped at MAX_HISTORY_SIZE; oldest is dropped when exceeded.
 * - Schedules a debounced server persistence call.
 */
export function push(snapshot: CanvasSnapshot): void {
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

  schedulePersist(snapshot);
}

/**
 * Reverts the canvas to the previous snapshot.
 * No-op if the cursor is already at the bottom of the stack (nothing to undo).
 */
export function undo(): void {
  if (cursor <= 0) return;
  cursor -= 1;
  applySnapshot(stack[cursor]);
}

/**
 * Re-applies the next snapshot after an undo.
 * No-op if the cursor is already at the top of the stack (nothing to redo).
 */
export function redo(): void {
  if (cursor >= stack.length - 1) return;
  cursor += 1;
  applySnapshot(stack[cursor]);
}

/**
 * The history store object — satisfies the `StoryboardHistoryStore` interface
 * expected by `useStoryboardKeyboard`.
 */
export const storyboardHistoryStore: StoryboardHistoryStore = {
  undo,
  redo,
};
