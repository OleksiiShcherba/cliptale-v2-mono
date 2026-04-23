/**
 * useSceneTemplates — React Query hook for listing scene templates.
 *
 * Fetches the authenticated user's scene templates and supports client-side
 * text filtering with a 300ms debounce on the search term.
 *
 * Query key: ['scene-templates', search] — search is the raw debounced value.
 * Re-fetch happens automatically when `search` changes (after debounce).
 *
 * Mutations (create / update / delete / add-to-storyboard) are performed via
 * the storyboard API functions and the caller is responsible for calling
 * `queryClient.invalidateQueries(['scene-templates'])` after each mutation.
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listSceneTemplates,
  createSceneTemplate,
  updateSceneTemplate,
  deleteSceneTemplate,
  addTemplateToStoryboard,
} from '../api';
import type {
  SceneTemplate,
  CreateSceneTemplatePayload,
  UpdateSceneTemplatePayload,
} from '../types';

export const SCENE_TEMPLATES_QUERY_KEY = 'scene-templates';

// ── Types ──────────────────────────────────────────────────────────────────────

type UseSceneTemplatesResult = {
  /** Templates filtered client-side by `filterText`. */
  templates: SceneTemplate[];
  /** True while the initial query is in flight. */
  isLoading: boolean;
  /** Non-null when the query fails. */
  error: string | null;
  /** Current filter text (raw, before debounce). */
  filterText: string;
  /** Update the filter text; debounce is handled internally. */
  setFilterText: (text: string) => void;
  /** Creates a template and invalidates the query cache. */
  createTemplate: (payload: CreateSceneTemplatePayload) => Promise<SceneTemplate>;
  /** Updates a template and invalidates the query cache. */
  updateTemplate: (id: string, payload: UpdateSceneTemplatePayload) => Promise<SceneTemplate>;
  /** Soft-deletes a template and invalidates the query cache. */
  removeTemplate: (id: string) => Promise<void>;
  /** Adds a template as a block to a storyboard. */
  addToStoryboard: (templateId: string, draftId: string) => ReturnType<typeof addTemplateToStoryboard>;
};

// ── Debounce helper ────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Filter helper ──────────────────────────────────────────────────────────────

function filterTemplates(templates: SceneTemplate[], search: string): SceneTemplate[] {
  if (!search.trim()) return templates;
  const q = search.toLowerCase();
  return templates.filter((t) => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.prompt.toLowerCase().includes(q)) return true;
    return false;
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetches scene templates and exposes CRUD helpers that keep the cache fresh.
 */
export function useSceneTemplates(): UseSceneTemplatesResult {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const debouncedFilter = useDebounced(filterText, DEBOUNCE_MS);

  const { data, isLoading, error } = useQuery({
    queryKey: [SCENE_TEMPLATES_QUERY_KEY],
    queryFn: () => listSceneTemplates(),
    staleTime: 30_000,
  });

  const allTemplates: SceneTemplate[] = data?.items ?? [];
  const templates = filterTemplates(allTemplates, debouncedFilter);

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: [SCENE_TEMPLATES_QUERY_KEY] });

  const createTemplate = async (payload: CreateSceneTemplatePayload): Promise<SceneTemplate> => {
    const template = await createSceneTemplate(payload);
    await invalidate();
    return template;
  };

  const updateTemplate = async (
    id: string,
    payload: UpdateSceneTemplatePayload,
  ): Promise<SceneTemplate> => {
    const template = await updateSceneTemplate(id, payload);
    await invalidate();
    return template;
  };

  const removeTemplate = async (id: string): Promise<void> => {
    await deleteSceneTemplate(id);
    await invalidate();
  };

  const addToStoryboard = (
    templateId: string,
    draftId: string,
  ): ReturnType<typeof addTemplateToStoryboard> => addTemplateToStoryboard({ templateId, draftId });

  return {
    templates,
    isLoading,
    error: error ? (error as Error).message : null,
    filterText,
    setFilterText,
    createTemplate,
    updateTemplate,
    removeTemplate,
    addToStoryboard,
  };
}
