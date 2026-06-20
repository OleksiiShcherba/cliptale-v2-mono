/**
 * useMotionGraphicsList — the list-page data layer (T13 / AC-01, AC-12, AC-13).
 *
 * Mirrors the generate-ai-flow slice convention exactly:
 *   - TanStack Query useQuery for the list, useMutation for rename/duplicate.
 *   - api.ts wrappers only (never raw fetch).
 *   - mutations invalidate the list query key so the cards re-derive from server.
 *
 * The server returns graphics most-recent first (GET /motion-graphics, Flow 5),
 * so the hook preserves that order — no client-side sort or over-fetch (≤400 ms NFR).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  duplicateMotionGraphic,
  listMotionGraphics,
  renameMotionGraphic,
} from '../api';
import type {
  MotionGraphic,
  MotionGraphicSummary,
  MotionGraphicSummaryPage,
} from '../types';

const EMPTY_PAGE: MotionGraphicSummaryPage = { items: [], nextCursor: null };

export const MOTION_GRAPHICS_QUERY_KEY = ['motion-graphic', 'list'] as const;

/** Project a full MotionGraphic (duplicate result) down to the list summary shape. */
function toSummary(g: MotionGraphic): MotionGraphicSummary {
  return {
    id: g.id,
    title: g.title,
    durationSeconds: g.durationSeconds,
    status: g.status,
    version: g.version,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export interface UseMotionGraphicsListResult {
  graphics: MotionGraphicSummary[];
  isLoading: boolean;
  isError: boolean;
  /** Rename a graphic (PATCH /:id); resolves once the list is refreshed. */
  rename: (id: string, title: string) => Promise<void>;
  /** Duplicate a graphic (POST /:id/duplicate); resolves with the new copy (AC-12). */
  duplicate: (id: string) => Promise<MotionGraphicSummary>;
}

export function useMotionGraphicsList(): UseMotionGraphicsListResult {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: MOTION_GRAPHICS_QUERY_KEY,
    queryFn: () => listMotionGraphics(),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameMotionGraphic(id, { title }),
    onSuccess: (updated) => {
      // Reflect the new title in place immediately (AC-01), then reconcile.
      queryClient.setQueryData<MotionGraphicSummaryPage>(
        MOTION_GRAPHICS_QUERY_KEY,
        (prev) => {
          const page = prev ?? EMPTY_PAGE;
          return {
            ...page,
            items: page.items.map((g) => (g.id === updated.id ? updated : g)),
          };
        },
      );
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateMotionGraphic(id),
    onSuccess: (copy) => {
      // Show the new copy at the top (newest-first) immediately (AC-12), then reconcile.
      queryClient.setQueryData<MotionGraphicSummaryPage>(
        MOTION_GRAPHICS_QUERY_KEY,
        (prev) => {
          const page = prev ?? EMPTY_PAGE;
          return { ...page, items: [toSummary(copy), ...page.items] };
        },
      );
    },
  });

  async function rename(id: string, title: string): Promise<void> {
    await renameMutation.mutateAsync({ id, title });
  }

  async function duplicate(id: string): Promise<MotionGraphicSummary> {
    const copy = await duplicateMutation.mutateAsync(id);
    return toSummary(copy);
  }

  return {
    graphics: data?.items ?? [],
    isLoading,
    isError,
    rename,
    duplicate,
  };
}
