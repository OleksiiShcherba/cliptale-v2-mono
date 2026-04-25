/**
 * useClipDeleteShortcut — Delete / Backspace keyboard shortcut for clips.
 *
 * Attaches a `keydown` listener to `document` for the lifetime of the
 * component that mounts this hook. When `Delete` or `Backspace` is pressed:
 *
 * 1. Skip if the active element is a form field (`<input>`, `<textarea>`,
 *    `<select>`) or a contenteditable node — prevents accidental clip
 *    deletion while the user is typing in the caption editor or track
 *    rename field.
 * 2. Read the current selection from the ephemeral store snapshot.
 * 3. Cross-reference the project snapshot to exclude clips whose track
 *    is locked.
 * 4. Remove the remaining clips from the project document via `setProject`.
 * 5. Clear the selection via `setSelectedClips([])`.
 */

import { useEffect } from 'react';

import {
  getSnapshot as getEphemeralSnapshot,
  setSelectedClips,
} from '@/store/ephemeral-store';
import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers a document-level `Delete` / `Backspace` shortcut that removes
 * all selected, unlocked clips from the project. Must be called once inside
 * the `TimelinePanel` component. Has no return value.
 */
export function useClipDeleteShortcut(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      // Guard: skip when focus is inside a form field or contenteditable.
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (active?.getAttribute('contenteditable') === 'true') return;

      const { selectedClipIds } = getEphemeralSnapshot();
      if (selectedClipIds.length === 0) return;

      const projectDoc = getProjectSnapshot();
      const lockedTrackIds = new Set(
        (projectDoc.tracks ?? [])
          .filter((t) => t.locked)
          .map((t) => t.id),
      );

      // Only delete clips whose track is NOT locked.
      const idsToDelete = new Set(
        selectedClipIds.filter((clipId) => {
          const clip = (projectDoc.clips ?? []).find((c) => c.id === clipId);
          return clip !== undefined && !lockedTrackIds.has(clip.trackId);
        }),
      );

      if (idsToDelete.size === 0) return;

      const newClips = (projectDoc.clips ?? []).filter((c) => !idsToDelete.has(c.id));
      setProject({ ...projectDoc, clips: newClips });
      setSelectedClips([]);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
