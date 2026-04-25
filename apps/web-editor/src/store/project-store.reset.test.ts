import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getSnapshot,
  subscribe,
  getCurrentVersionId,
  setCurrentVersionId,
  setProject,
  resetProjectStore,
} from './project-store.js';
import {
  pushPatches,
  hasPendingPatches,
  drainPatches,
  resetHistoryStore,
  subscribe as historySubscribe,
  _resetForTesting as resetHistory,
} from './history-store.js';

import type { Patch } from 'immer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForwardPatch(val: string): Patch {
  return { op: 'replace', path: ['title'], value: val };
}

// ---------------------------------------------------------------------------
// Tests — resetProjectStore
// ---------------------------------------------------------------------------

describe('project-store — resetProjectStore', () => {
  beforeEach(() => {
    resetHistory();
  });

  it('replaces the snapshot id with the given projectId', () => {
    resetProjectStore('project-beta');
    expect(getSnapshot().id).toBe('project-beta');
  });

  it('clears tracks to an empty array', () => {
    resetProjectStore('project-beta');
    expect(getSnapshot().tracks).toHaveLength(0);
  });

  it('clears clips to an empty array', () => {
    resetProjectStore('project-beta');
    expect(getSnapshot().clips).toHaveLength(0);
  });

  it('sets currentVersionId to null', () => {
    setCurrentVersionId(42);
    resetProjectStore('project-beta');
    expect(getCurrentVersionId()).toBeNull();
  });

  it('preserves expected defaults: fps=30, width=1920, height=1080, schemaVersion=1', () => {
    resetProjectStore('project-defaults');
    const snap = getSnapshot();
    expect(snap.fps).toBe(30);
    expect(snap.width).toBe(1920);
    expect(snap.height).toBe(1080);
    expect(snap.schemaVersion).toBe(1);
  });

  it('notifies subscribers when called', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    resetProjectStore('project-notify');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does NOT push patches to history-store — hasPendingPatches stays false', () => {
    drainPatches(); // start clean
    resetProjectStore('project-no-patches');
    expect(hasPendingPatches()).toBe(false);
  });

  it('full sequence: populate A → reset to B → snapshot reflects B and is empty', () => {
    // Set up project A state
    setProject({
      schemaVersion: 1,
      id: 'project-alpha',
      title: 'Project A',
      fps: 30,
      durationFrames: 300,
      width: 1920,
      height: 1080,
      tracks: [{ id: 'track-1', type: 'video' as const, name: 'Video', muted: false, locked: false }],
      clips: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as Parameters<typeof setProject>[0]);

    setCurrentVersionId(5);
    expect(getSnapshot().tracks).toHaveLength(1);
    expect(getCurrentVersionId()).toBe(5);

    // Push some patches into history-store
    pushPatches(
      [makeForwardPatch('A changed')],
      [makeForwardPatch('A original')],
    );
    expect(hasPendingPatches()).toBe(true);

    // Reset stores for project B
    resetProjectStore('project-beta');
    resetHistoryStore();

    // Project store assertions
    expect(getSnapshot().tracks).toHaveLength(0);
    expect(getSnapshot().clips).toHaveLength(0);
    expect(getSnapshot().id).toBe('project-beta');
    expect(getCurrentVersionId()).toBeNull();

    // History store assertions
    expect(hasPendingPatches()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — resetHistoryStore (public promotion)
// ---------------------------------------------------------------------------

describe('history-store — resetHistoryStore (public API)', () => {
  beforeEach(() => {
    resetHistory();
  });

  it('clears accumulated patches so hasPendingPatches returns false', () => {
    pushPatches(
      [makeForwardPatch('forward')],
      [makeForwardPatch('inverse')],
    );
    expect(hasPendingPatches()).toBe(true);

    resetHistoryStore();

    expect(hasPendingPatches()).toBe(false);
  });

  it('notifies listeners so useAutosave sees the cleared state', () => {
    const listener = vi.fn();
    const unsub = historySubscribe(listener);

    resetHistoryStore();

    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('is callable as resetHistoryStore (public) without underscore prefix', () => {
    expect(typeof resetHistoryStore).toBe('function');
  });

  it('_resetForTesting delegate still works (backward compatibility)', () => {
    pushPatches([makeForwardPatch('x')], [makeForwardPatch('y')]);
    resetHistory(); // calls _resetForTesting → resetHistoryStore
    expect(hasPendingPatches()).toBe(false);
  });
});
