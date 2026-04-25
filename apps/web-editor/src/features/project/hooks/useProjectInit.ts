import { useState, useEffect } from 'react';

import { createProject } from '@/features/project/api';
import { fetchLatestVersion } from '@/features/version-history/api';
import { getSnapshot, setProjectSilent, setCurrentVersionId, resetProjectStore } from '@/store/project-store';
import { resetHistoryStore } from '@/store/history-store';
import type { ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectInitState =
  | { status: 'loading'; projectId: null }
  | { status: 'hydrating'; projectId: string }
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

/**
 * Returns true when the error looks like a 404 (no version found yet).
 * We pattern-match on the `status` property added by `fetchLatestVersion`.
 */
function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as Error & { status?: number }).status === 404
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Resolves the active project ID for the editor session and hydrates the
 * project store from the latest saved version:
 *
 * 1. If `?projectId=<uuid>` is present in the URL → begins hydration immediately.
 * 2. Otherwise → calls `POST /projects` to create a new project, writes the
 *    UUID into the URL, then begins hydration.
 *
 * Hydration (status: 'hydrating'):
 * - Fetches `GET /projects/:id/versions/latest`.
 * - On success: calls `setProjectSilent(docJson)` + `setCurrentVersionId(versionId)`
 *   (no patches pushed into history-store) then transitions to `ready`.
 * - On 404 (new project, no versions yet): calls `setProjectSilent` to sync
 *   the store's `id` field with the resolved projectId, then transitions to `ready`.
 * - On other fetch errors: transitions to `error`.
 *
 * Returns a discriminated union so callers can render loading / error states.
 */
export function useProjectInit(): ProjectInitState {
  const [state, setState] = useState<ProjectInitState>(() => {
    const urlProjectId = getProjectIdFromUrl();
    if (urlProjectId) {
      return { status: 'hydrating', projectId: urlProjectId };
    }
    return { status: 'loading', projectId: null };
  });

  // ── Phase 1: create project if none in URL ───────────────────────────────
  useEffect(() => {
    if (state.status !== 'loading') return;

    let cancelled = false;

    createProject()
      .then(({ projectId }) => {
        if (cancelled) return;
        setProjectIdInUrl(projectId);
        setState({ status: 'hydrating', projectId });
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

  // Extract a stable value for the dep array: projectId if hydrating, null otherwise.
  // This ensures the hydration effect re-runs when the projectId changes (e.g. the
  // create flow produces a new projectId that moves us into hydrating state).
  const hydratingProjectId = state.status === 'hydrating' ? state.projectId : null;

  // ── Phase 2: hydrate store from latest version ───────────────────────────
  useEffect(() => {
    if (!hydratingProjectId) return;

    const projectId = hydratingProjectId;
    let cancelled = false;

    // Reset stores before fetching so any accumulated patches and undo/redo
    // history from a previously-loaded project cannot bleed into this session.
    // Both calls notify listeners synchronously, which causes useAutosave to
    // read hasPendingPatches() === false and skip any in-flight debounce.
    resetProjectStore(projectId);
    resetHistoryStore();

    fetchLatestVersion(projectId)
      .then((latest) => {
        if (cancelled) return;
        // Hydrate silently — no patches pushed into history-store so the first
        // autosave does not re-send the entire doc as a patch.
        // Always override docJson.id with the URL-resolved projectId: the URL is
        // the authoritative identity source; a stale or mismatched docJson.id
        // would otherwise cause every downstream POST (clips, versions) to target
        // the wrong project.
        setProjectSilent({ ...(latest.docJson as ProjectDoc), id: projectId });
        setCurrentVersionId(latest.versionId);
        setState({ status: 'ready', projectId });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isNotFoundError(err)) {
          // New project: no versions yet — sync the store id with the resolved
          // projectId so downstream writes target the correct project.
          setProjectSilent({ ...getSnapshot(), id: projectId });
          setState({ status: 'ready', projectId });
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Unknown error loading project';
        setState({ status: 'error', projectId: null, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [hydratingProjectId]);

  return state;
}
