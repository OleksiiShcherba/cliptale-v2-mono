/**
 * useClipDeleteShortcut — happy-path and edge-case tests.
 *
 * Focus-guard tests (INPUT/TEXTAREA/SELECT/contenteditable no-ops) live in
 * `useClipDeleteShortcut.guards.test.ts` to keep each file under 300 lines.
 *
 * Tests cover:
 *   - Delete key removes selected unlocked clips and clears selection
 *   - Backspace key behaves identically to Delete
 *   - Locked clip guard: clips on locked tracks not deleted
 *   - Mixed selection: unlocked deleted, locked preserved
 *   - Empty selection no-op
 *   - Non-Delete/Backspace keys are ignored
 *   - Listener removed on unmount
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import * as ephemeralStore from '@/store/ephemeral-store';
import * as projectStore from '@/store/project-store';

import {
  makeTrack,
  makeClip,
  makeProjectDoc,
  dispatchKey,
} from './useClipDeleteShortcut.fixtures';
import { useClipDeleteShortcut } from './useClipDeleteShortcut';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/ephemeral-store', async (importOriginal) => {
  const actual = await importOriginal<typeof ephemeralStore>();
  return {
    ...actual,
    getSnapshot: vi.fn(),
    setSelectedClips: vi.fn(),
  };
});

vi.mock('@/store/project-store', async (importOriginal) => {
  const actual = await importOriginal<typeof projectStore>();
  return {
    ...actual,
    getSnapshot: vi.fn(),
    setProject: vi.fn(),
  };
});

// ── Setup ─────────────────────────────────────────────────────────────────────

function makeEmptyEphemeralState() {
  return {
    selectedClipIds: [],
    pxPerFrame: 4,
    scrollOffsetX: 0,
    playheadFrame: 0,
    zoom: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ephemeralStore.getSnapshot).mockReturnValue(makeEmptyEphemeralState());
  vi.mocked(projectStore.getSnapshot).mockReturnValue(makeProjectDoc([], []) as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useClipDeleteShortcut', () => {
  it('removes selected unlocked clips on Delete', () => {
    const track = makeTrack('track-1', false);
    const clip = makeClip('clip-1', 'track-1');
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1'],
    });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(
      makeProjectDoc([track], [clip]) as never,
    );

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).toHaveBeenCalledWith(
      expect.objectContaining({ clips: [] }),
    );
    expect(vi.mocked(ephemeralStore.setSelectedClips)).toHaveBeenCalledWith([]);
  });

  it('removes selected unlocked clips on Backspace', () => {
    const track = makeTrack('track-1', false);
    const clip = makeClip('clip-1', 'track-1');
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1'],
    });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(
      makeProjectDoc([track], [clip]) as never,
    );

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Backspace');

    expect(vi.mocked(projectStore.setProject)).toHaveBeenCalledWith(
      expect.objectContaining({ clips: [] }),
    );
    expect(vi.mocked(ephemeralStore.setSelectedClips)).toHaveBeenCalledWith([]);
  });

  it('does NOT delete clips on locked tracks', () => {
    const track = makeTrack('track-1', true); // locked
    const clip = makeClip('clip-1', 'track-1');
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1'],
    });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(
      makeProjectDoc([track], [clip]) as never,
    );

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();
  });

  it('deletes unlocked clips and preserves locked clips in a mixed selection', () => {
    const unlockedTrack = makeTrack('track-1', false);
    const lockedTrack = makeTrack('track-2', true);
    const unlockedClip = makeClip('clip-1', 'track-1');
    const lockedClip = makeClip('clip-2', 'track-2');
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1', 'clip-2'],
    });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(
      makeProjectDoc([unlockedTrack, lockedTrack], [unlockedClip, lockedClip]) as never,
    );

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).toHaveBeenCalledWith(
      expect.objectContaining({ clips: [lockedClip] }),
    );
    expect(vi.mocked(ephemeralStore.setSelectedClips)).toHaveBeenCalledWith([]);
  });

  it('does nothing when there is no selection', () => {
    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();
  });

  it('ignores keys other than Delete and Backspace', () => {
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1'],
    });

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Escape');
    dispatchKey('x');
    dispatchKey('ArrowLeft');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
  });

  it('removes the event listener on unmount', () => {
    const track = makeTrack('track-1', false);
    const clip = makeClip('clip-1', 'track-1');
    vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
      ...makeEmptyEphemeralState(),
      selectedClipIds: ['clip-1'],
    });
    vi.mocked(projectStore.getSnapshot).mockReturnValue(
      makeProjectDoc([track], [clip]) as never,
    );

    const { unmount } = renderHook(() => useClipDeleteShortcut());
    unmount();

    dispatchKey('Delete');
    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
  });
});
