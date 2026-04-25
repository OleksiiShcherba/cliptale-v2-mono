import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Patch } from 'immer';

import {
  pushPatches,
  getSnapshot,
  subscribe,
  undo,
  redo,
  drainPatches,
  hasPendingPatches,
  _resetForTesting,
} from './history-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  patchVal = 'a',
): { patches: Patch[]; inversePatches: Patch[] } {
  return {
    patches: [{ op: 'replace', path: ['title'], value: patchVal }],
    inversePatches: [{ op: 'replace', path: ['title'], value: 'original' }],
  };
}

/** Reset the store singleton to a clean state between tests. */
function resetStore(): void {
  _resetForTesting();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('history-store', () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // pushPatches
  // -------------------------------------------------------------------------
  describe('pushPatches', () => {
    it('adds an entry to the undo stack, enabling canUndo', () => {
      expect(getSnapshot().canUndo).toBe(false);

      const { patches, inversePatches } = makeEntry();
      pushPatches(patches, inversePatches);

      expect(getSnapshot().canUndo).toBe(true);
    });

    it('clears the redo stack when a new entry is pushed', () => {
      const e1 = makeEntry('v1');
      pushPatches(e1.patches, e1.inversePatches);

      const entry = undo();
      expect(entry).not.toBeNull();
      expect(getSnapshot().canRedo).toBe(true);

      // Push a new operation — must clear redo
      const e2 = makeEntry('v2');
      pushPatches(e2.patches, e2.inversePatches);

      expect(getSnapshot().canRedo).toBe(false);
    });

    it('accumulates patches in the drain buffer on each call', () => {
      const e1 = makeEntry('v1');
      const e2 = makeEntry('v2');

      pushPatches(e1.patches, e1.inversePatches);
      pushPatches(e2.patches, e2.inversePatches);

      const { patches, inversePatches } = drainPatches();
      expect(patches).toHaveLength(2);
      expect(inversePatches).toHaveLength(2);
    });

    it('notifies subscribers', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);

      pushPatches(makeEntry().patches, makeEntry().inversePatches);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // undo
  // -------------------------------------------------------------------------
  describe('undo', () => {
    it('returns null when the undo stack is empty', () => {
      expect(undo()).toBeNull();
    });

    it('returns the last pushed entry and removes it from the undo stack', () => {
      const { patches, inversePatches } = makeEntry('v1');
      pushPatches(patches, inversePatches);

      const entry = undo();
      expect(entry).not.toBeNull();
      expect(entry!.patches).toEqual(patches);
      expect(entry!.inversePatches).toEqual(inversePatches);
      expect(getSnapshot().canUndo).toBe(false);
    });

    it('moves the undone entry onto the redo stack', () => {
      pushPatches(makeEntry('v1').patches, makeEntry('v1').inversePatches);
      expect(getSnapshot().canRedo).toBe(false);

      undo();

      expect(getSnapshot().canRedo).toBe(true);
    });

    it('handles multiple sequential undos in LIFO order', () => {
      const e1 = makeEntry('v1');
      const e2 = makeEntry('v2');
      pushPatches(e1.patches, e1.inversePatches);
      pushPatches(e2.patches, e2.inversePatches);

      const r2 = undo();
      expect(r2!.patches[0].value).toBe('v2');

      const r1 = undo();
      expect(r1!.patches[0].value).toBe('v1');

      expect(getSnapshot().canUndo).toBe(false);
    });

    it('notifies subscribers on undo', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      undo();

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // redo
  // -------------------------------------------------------------------------
  describe('redo', () => {
    it('returns null when the redo stack is empty', () => {
      expect(redo()).toBeNull();
    });

    it('returns the last undone entry and moves it back to the undo stack', () => {
      const { patches, inversePatches } = makeEntry('v1');
      pushPatches(patches, inversePatches);
      undo();

      const entry = redo();
      expect(entry).not.toBeNull();
      expect(entry!.patches).toEqual(patches);
      expect(getSnapshot().canUndo).toBe(true);
      expect(getSnapshot().canRedo).toBe(false);
    });

    it('handles multiple sequential redos', () => {
      const e1 = makeEntry('v1');
      const e2 = makeEntry('v2');
      pushPatches(e1.patches, e1.inversePatches);
      pushPatches(e2.patches, e2.inversePatches);

      undo();
      undo();

      const r1 = redo();
      expect(r1!.patches[0].value).toBe('v1');

      const r2 = redo();
      expect(r2!.patches[0].value).toBe('v2');

      expect(getSnapshot().canRedo).toBe(false);
    });

    it('notifies subscribers on redo', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      undo();

      const listener = vi.fn();
      const unsub = subscribe(listener);

      redo();

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // drainPatches
  // -------------------------------------------------------------------------
  describe('drainPatches', () => {
    it('returns empty arrays when no patches have been pushed', () => {
      const { patches, inversePatches } = drainPatches();
      expect(patches).toHaveLength(0);
      expect(inversePatches).toHaveLength(0);
    });

    it('returns all accumulated patches and clears the buffer', () => {
      const e1 = makeEntry('a');
      const e2 = makeEntry('b');
      pushPatches(e1.patches, e1.inversePatches);
      pushPatches(e2.patches, e2.inversePatches);

      const first = drainPatches();
      expect(first.patches).toHaveLength(2);

      const second = drainPatches();
      expect(second.patches).toHaveLength(0);
    });

    it('drain does not affect the undo/redo stacks', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      pushPatches(makeEntry().patches, makeEntry().inversePatches);

      drainPatches();

      expect(getSnapshot().canUndo).toBe(true);
    });

    it('returns the correct inverse patches', () => {
      const e = makeEntry('forward');
      pushPatches(e.patches, e.inversePatches);

      const { inversePatches } = drainPatches();
      expect(inversePatches[0].value).toBe('original');
    });
  });

  // -------------------------------------------------------------------------
  // hasPendingPatches
  // -------------------------------------------------------------------------
  describe('hasPendingPatches', () => {
    it('returns false when no patches have been pushed', () => {
      expect(hasPendingPatches()).toBe(false);
    });

    it('returns true after pushPatches', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      expect(hasPendingPatches()).toBe(true);
    });

    it('returns false after drainPatches', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      drainPatches();
      expect(hasPendingPatches()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // subscribe / getSnapshot
  // -------------------------------------------------------------------------
  describe('subscribe', () => {
    it('does not notify listener after unsubscribing', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);
      unsub();

      pushPatches(makeEntry().patches, makeEntry().inversePatches);

      expect(listener).not.toHaveBeenCalled();
    });

    it('returns an unsubscribe function', () => {
      const unsub = subscribe(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('getSnapshot', () => {
    it('reflects canUndo correctly', () => {
      expect(getSnapshot().canUndo).toBe(false);
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      expect(getSnapshot().canUndo).toBe(true);
    });

    it('reflects canRedo correctly', () => {
      pushPatches(makeEntry().patches, makeEntry().inversePatches);
      expect(getSnapshot().canRedo).toBe(false);
      undo();
      expect(getSnapshot().canRedo).toBe(true);
      redo();
      expect(getSnapshot().canRedo).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('calling undo on an empty stack does not throw', () => {
      expect(() => undo()).not.toThrow();
    });

    it('calling redo on an empty redo stack does not throw', () => {
      expect(() => redo()).not.toThrow();
    });

    it('undo/redo with empty patch arrays does not throw', () => {
      pushPatches([], []);
      expect(() => undo()).not.toThrow();
      expect(() => redo()).not.toThrow();
    });

    it('pushing patches with empty arrays still accumulates (zero length)', () => {
      pushPatches([], []);
      const { patches } = drainPatches();
      expect(patches).toHaveLength(0);
    });

    it('undo followed by redo preserves the original patch value', () => {
      const { patches, inversePatches } = makeEntry('original-value');
      pushPatches(patches, inversePatches);

      const undoneEntry = undo();
      const redoneEntry = redo();

      expect(undoneEntry!.patches[0].value).toBe('original-value');
      expect(redoneEntry!.patches[0].value).toBe('original-value');
    });
  });
});
