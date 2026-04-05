/**
 * useClipDeleteShortcut — focus-guard tests.
 *
 * Verifies that Delete / Backspace is a no-op when focus is inside a form
 * field or contenteditable element. Happy-path and edge-case tests live in
 * `useClipDeleteShortcut.test.ts`.
 *
 * Tests cover:
 *   - <input> focused → no-op
 *   - <textarea> focused → no-op
 *   - <select> focused → no-op
 *   - contenteditable element focused → no-op
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  const track = makeTrack('track-1', false);
  const clip = makeClip('clip-1', 'track-1');
  vi.mocked(ephemeralStore.getSnapshot).mockReturnValue({
    ...makeEmptyEphemeralState(),
    selectedClipIds: ['clip-1'],
  });
  vi.mocked(projectStore.getSnapshot).mockReturnValue(
    makeProjectDoc([track], [clip]) as never,
  );
});

afterEach(() => {
  // Restore document.activeElement to body after each test.
  (document.activeElement as HTMLElement | null)?.blur?.();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useClipDeleteShortcut — focus guards', () => {
  it('does nothing when an <input> has focus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('does nothing when a <textarea> has focus', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('does nothing when a <select> has focus', () => {
    const select = document.createElement('select');
    document.body.appendChild(select);
    select.focus();

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();

    document.body.removeChild(select);
  });

  it('does nothing when a contenteditable element has focus', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();

    renderHook(() => useClipDeleteShortcut());
    dispatchKey('Delete');

    expect(vi.mocked(projectStore.setProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ephemeralStore.setSelectedClips)).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });
});
