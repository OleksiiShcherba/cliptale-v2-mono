import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/history-store', () => ({
  undo: vi.fn(),
  redo: vi.fn(),
  useHistoryStore: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProjectSilent: vi.fn(),
}));

vi.mock('immer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('immer')>();
  return {
    ...actual,
    applyPatches: vi.fn((base: object, patches: unknown[]) => {
      return { ...base, _patchesApplied: patches };
    }),
  };
});

import { useUndoRedo } from './useUndoRedo';
import * as historyStore from '@/store/history-store';
import * as projectStore from '@/store/project-store';

// Convenience alias for the silent setter used by useUndoRedo
const getSetProjectSilent = () => vi.mocked(projectStore.setProjectSilent);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeProjectDoc = (overrides = {}) => ({
  schemaVersion: 1,
  id: 'proj-1',
  title: 'Test',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [],
  clips: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUndoRedo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectStore.getSnapshot).mockReturnValue(makeProjectDoc() as never);
    vi.mocked(historyStore.useHistoryStore).mockReturnValue({ canUndo: false, canRedo: false });
    vi.mocked(historyStore.undo).mockReturnValue(null);
    vi.mocked(historyStore.redo).mockReturnValue(null);
  });

  // ── canUndo / canRedo state ────────────────────────────────────────────────

  it('returns canUndo=false and canRedo=false when history store has no history', () => {
    vi.mocked(historyStore.useHistoryStore).mockReturnValue({ canUndo: false, canRedo: false });
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('returns canUndo=true when history store reports canUndo', () => {
    vi.mocked(historyStore.useHistoryStore).mockReturnValue({ canUndo: true, canRedo: false });
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canUndo).toBe(true);
  });

  it('returns canRedo=true when history store reports canRedo', () => {
    vi.mocked(historyStore.useHistoryStore).mockReturnValue({ canUndo: false, canRedo: true });
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canRedo).toBe(true);
  });

  // ── handleUndo ────────────────────────────────────────────────────────────

  it('handleUndo calls undo() from history-store', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleUndo();
    });
    expect(historyStore.undo).toHaveBeenCalledOnce();
  });

  it('handleUndo does not call setProjectSilent when undo() returns null (nothing to undo)', () => {
    vi.mocked(historyStore.undo).mockReturnValue(null);
    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleUndo();
    });
    expect(getSetProjectSilent()).not.toHaveBeenCalled();
  });

  it('handleUndo calls setProjectSilent with the patch-applied document when undo() returns an entry', () => {
    const inversePatches = [{ op: 'replace' as const, path: ['/title'], value: 'Before' }];
    vi.mocked(historyStore.undo).mockReturnValue({ patches: [], inversePatches });
    const baseDoc = makeProjectDoc({ title: 'After' });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(baseDoc as never);

    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleUndo();
    });

    expect(getSetProjectSilent()).toHaveBeenCalledOnce();
    const calledWith = getSetProjectSilent().mock.calls[0][0] as { _patchesApplied: unknown };
    expect(calledWith._patchesApplied).toBe(inversePatches);
  });

  // ── handleRedo ────────────────────────────────────────────────────────────

  it('handleRedo calls redo() from history-store', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleRedo();
    });
    expect(historyStore.redo).toHaveBeenCalledOnce();
  });

  it('handleRedo does not call setProjectSilent when redo() returns null (nothing to redo)', () => {
    vi.mocked(historyStore.redo).mockReturnValue(null);
    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleRedo();
    });
    expect(getSetProjectSilent()).not.toHaveBeenCalled();
  });

  it('handleRedo calls setProjectSilent with the patch-applied document when redo() returns an entry', () => {
    const forwardPatches = [{ op: 'replace' as const, path: ['/title'], value: 'After' }];
    vi.mocked(historyStore.redo).mockReturnValue({ patches: forwardPatches, inversePatches: [] });
    const baseDoc = makeProjectDoc({ title: 'Before' });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(baseDoc as never);

    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      result.current.handleRedo();
    });

    expect(getSetProjectSilent()).toHaveBeenCalledOnce();
    const calledWith = getSetProjectSilent().mock.calls[0][0] as { _patchesApplied: unknown };
    expect(calledWith._patchesApplied).toBe(forwardPatches);
  });

  // ── Stable references ─────────────────────────────────────────────────────

  it('handleUndo and handleRedo are stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useUndoRedo());
    const { handleUndo: undo1, handleRedo: redo1 } = result.current;
    rerender();
    expect(result.current.handleUndo).toBe(undo1);
    expect(result.current.handleRedo).toBe(redo1);
  });
});
