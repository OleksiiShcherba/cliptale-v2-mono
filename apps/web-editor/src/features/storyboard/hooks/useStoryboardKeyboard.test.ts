/**
 * Tests for useStoryboardKeyboard.
 *
 * Covers:
 * - Delete: calls onRemoveNode for a selected SCENE node.
 * - Delete: no-op when START node is selected.
 * - Delete: no-op when END node is selected.
 * - Delete: no-op when no node is selected.
 * - Ctrl+Z: calls historyStore.undo().
 * - Ctrl+Y: calls historyStore.redo().
 * - Ctrl+Shift+Z: calls historyStore.redo().
 * - Listener is added on mount and removed on unmount (no leak).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { Node } from '@xyflow/react';

import { useStoryboardKeyboard } from './useStoryboardKeyboard';
import type { StoryboardHistoryStore } from '../store/storyboard-history-store';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeNode(id: string, type: string, selected = false): Node {
  return {
    id,
    type,
    position: { x: 100, y: 100 },
    data: {},
    selected,
  };
}

function makeHistoryStore(): StoryboardHistoryStore {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
  };
}

function fireKey(key: string, ctrlKey = false, shiftKey = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, shiftKey, bubbles: true }));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardKeyboard', () => {
  describe('listener lifecycle', () => {
    it('adds a keydown listener on mount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');

      const { unmount } = renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore: makeHistoryStore(),
        }),
      );

      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      unmount();
      vi.restoreAllMocks();
    });

    it('removes the keydown listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore: makeHistoryStore(),
        }),
      );

      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      vi.restoreAllMocks();
    });
  });

  describe('Delete key', () => {
    it('calls onRemoveNode when a scene-block node is selected', () => {
      const onRemoveNode = vi.fn();
      const sceneNode = makeNode('scene-1', 'scene-block', true);

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [sceneNode],
          onRemoveNode,
          historyStore: makeHistoryStore(),
        }),
      );

      fireKey('Delete');
      expect(onRemoveNode).toHaveBeenCalledWith('scene-1');
    });

    it('does NOT call onRemoveNode when a START node is selected', () => {
      const onRemoveNode = vi.fn();
      const startNode = makeNode('start-node', 'start', true);

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [startNode],
          onRemoveNode,
          historyStore: makeHistoryStore(),
        }),
      );

      fireKey('Delete');
      expect(onRemoveNode).not.toHaveBeenCalled();
    });

    it('does NOT call onRemoveNode when an END node is selected', () => {
      const onRemoveNode = vi.fn();
      const endNode = makeNode('end-node', 'end', true);

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [endNode],
          onRemoveNode,
          historyStore: makeHistoryStore(),
        }),
      );

      fireKey('Delete');
      expect(onRemoveNode).not.toHaveBeenCalled();
    });

    it('does NOT call onRemoveNode when no node is selected', () => {
      const onRemoveNode = vi.fn();
      const sceneNode = makeNode('scene-1', 'scene-block', false);

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [sceneNode],
          onRemoveNode,
          historyStore: makeHistoryStore(),
        }),
      );

      fireKey('Delete');
      expect(onRemoveNode).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+Z — undo', () => {
    it('calls historyStore.undo() on Ctrl+Z', () => {
      const historyStore = makeHistoryStore();

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore,
        }),
      );

      fireKey('z', true, false);
      expect(historyStore.undo).toHaveBeenCalledTimes(1);
      expect(historyStore.redo).not.toHaveBeenCalled();
    });

    it('does NOT call undo on plain Z (no ctrl)', () => {
      const historyStore = makeHistoryStore();

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore,
        }),
      );

      fireKey('z', false, false);
      expect(historyStore.undo).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+Y — redo', () => {
    it('calls historyStore.redo() on Ctrl+Y', () => {
      const historyStore = makeHistoryStore();

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore,
        }),
      );

      fireKey('y', true, false);
      expect(historyStore.redo).toHaveBeenCalledTimes(1);
      expect(historyStore.undo).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+Shift+Z — alternate redo', () => {
    it('calls historyStore.redo() on Ctrl+Shift+Z', () => {
      const historyStore = makeHistoryStore();

      renderHook(() =>
        useStoryboardKeyboard({
          nodes: [],
          onRemoveNode: vi.fn(),
          historyStore,
        }),
      );

      fireKey('Z', true, true);
      expect(historyStore.redo).toHaveBeenCalledTimes(1);
      expect(historyStore.undo).not.toHaveBeenCalled();
    });
  });

  describe('nodes ref stays current after update', () => {
    it('removes the newly selected node after rerender with updated nodes', () => {
      const onRemoveNode = vi.fn();

      // Start with no selection.
      const { rerender } = renderHook(
        ({ nodes }) =>
          useStoryboardKeyboard({
            nodes,
            onRemoveNode,
            historyStore: makeHistoryStore(),
          }),
        { initialProps: { nodes: [makeNode('scene-1', 'scene-block', false)] } },
      );

      fireKey('Delete');
      expect(onRemoveNode).not.toHaveBeenCalled();

      // Update: scene-1 is now selected.
      rerender({ nodes: [makeNode('scene-1', 'scene-block', true)] });

      fireKey('Delete');
      expect(onRemoveNode).toHaveBeenCalledWith('scene-1');
    });
  });
});
