import { useState, useEffect } from 'react';

import { createProject } from '@/features/project/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectInitState =
  | { status: 'loading'; projectId: null }
  | { status: 'ready'; projectId: string }
  | { status: 'error'; projectId: null; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads the `?projectId=` query parameter from the current URL, or null if absent. */
function getProjectIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId');
}

/** Pushes the project ID into the URL as a query param so the tab is bookmarkable. */
function setProjectIdInUrl(projectId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('projectId', projectId);
  window.history.replaceState(null, '', url.toString());
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Resolves the active project ID for the editor session:
 *
 * 1. If `?projectId=<uuid>` is present in the URL → uses it immediately (status: ready).
 * 2. Otherwise → calls `POST /projects` to create a new temporary project,
 *    writes the returned UUID into the URL via `history.replaceState` so the
 *    tab is bookmarkable, and transitions to status: ready.
 *
 * Returns a discriminated union so callers can render loading / error states.
 */
export function useProjectInit(): ProjectInitState {
  const [state, setState] = useState<ProjectInitState>(() => {
    const urlProjectId = getProjectIdFromUrl();
    if (urlProjectId) {
      return { status: 'ready', projectId: urlProjectId };
    }
    return { status: 'loading', projectId: null };
  });

  useEffect(() => {
    if (state.status !== 'loading') return;

    let cancelled = false;

    createProject()
      .then(({ projectId }) => {
        if (cancelled) return;
        setProjectIdInUrl(projectId);
        setState({ status: 'ready', projectId });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error creating project';
        setState({ status: 'error', projectId: null, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [state.status]);

  return state;
}
