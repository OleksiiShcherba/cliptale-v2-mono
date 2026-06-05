/**
 * useStoryboardHistoryPush — the checkpoint push client for the storyboard
 * canvas (storyboard-autosave-checkpoints, ADR-0002) plus the legacy
 * per-change `pushSnapshot` kept until T14 rewires StoryboardPage.
 *
 * Checkpoint surface (AC-03 / AC-04):
 * - `pushCheckpoint` — ONE call = capture the layout screenshot with the 5 s
 *   typed fallback (T7) → POST /storyboards/:draftId/history with
 *   `{ snapshot (+ inline dataUrl on success), previewKind }`. The push is
 *   NEVER conditional on the capture result — only previewKind changes.
 * - POST failure → visible `checkpointError` state + `retryCheckpoint()`
 *   re-sends the same failed body (no silent console-only errors).
 * - `inFlight` — the double-save guard source for T10/T11 (AC-07b); a push
 *   attempted while one is in flight is refused.
 * - The TanStack history key is invalidated after a successful push.
 */

import { useCallback, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { Node, Edge } from '@xyflow/react';

import type {
  HistoryPreviewKind,
  StoryboardHistoryPayload,
  StoryboardHistorySnapshot,
} from '@/features/storyboard/api';
import { pushCheckpointSnapshot } from '@/features/storyboard/api';
import { push as pushHistory } from '@/features/storyboard/store/storyboard-history-store';
import type { StoryboardState } from '@/features/storyboard/types';
import {
  captureCanvasThumbnail,
  captureCanvasThumbnailWithFallback,
} from '@/features/storyboard/utils/captureCanvasThumbnail';
import { getMusicBlocksFromNodes } from './useStoryboardMusic';

// ── Snapshot building (shared by the legacy and checkpoint paths) ─────────────

type SnapshotOptions = {
  musicBlocks?: StoryboardState['musicBlocks'];
};

function buildSnapshot(
  draftId: string,
  currentNodes: Node[],
  currentEdges: Edge[],
  options: SnapshotOptions,
): StoryboardHistoryPayload & { positions: Record<string, { x: number; y: number }> } {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of currentNodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }

  // Separate scene blocks from sentinel nodes to build the snapshot blocks array.
  const sceneBlocks = currentNodes
    .filter((n) => n.type === 'scene-block')
    .map(
      (n) =>
        (
          n.data as {
            block: {
              id: string;
              draftId: string;
              blockType: 'scene';
              name: string | null;
              prompt: string | null;
              videoPrompt: string | null;
              durationS: number;
              positionX: number;
              positionY: number;
              sortOrder: number;
              style: string | null;
              createdAt: string;
              updatedAt: string;
              mediaItems: [];
            };
          }
        ).block,
    );

  const sentinelBlocks = currentNodes
    .filter((n) => n.type === 'start' || n.type === 'end')
    .map((n) => ({
      id: n.id,
      draftId,
      blockType: n.type as 'start' | 'end',
      name: null as string | null,
      prompt: null as string | null,
      videoPrompt: null,
      durationS: 0,
      positionX: n.position.x,
      positionY: n.position.y,
      sortOrder: 0,
      style: null as string | null,
      createdAt: '',
      updatedAt: '',
      mediaItems: [] as [],
    }));

  return {
    blocks: [...sceneBlocks, ...sentinelBlocks],
    edges: currentEdges.map((e) => ({
      id: e.id,
      draftId,
      sourceBlockId: e.source,
      targetBlockId: e.target,
    })),
    musicBlocks: options.musicBlocks ?? getMusicBlocksFromNodes(currentNodes),
    positions,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export type StoryboardHistoryPushApi = {
  /**
   * LEGACY per-change push (in-memory undo stack + debounced persistence).
   * Removed when T14 wires the two-tier saving into StoryboardPage.
   */
  pushSnapshot: (
    nodes: Node[],
    edges: Edge[],
    options?: SnapshotOptions & { persistImmediately?: boolean },
  ) => Promise<void>;
  /**
   * Checkpoint push: capture (5 s typed fallback) → ONE POST with
   * { snapshot, previewKind }. Resolves `true` on success, `false` on a
   * refused (in-flight) or failed push.
   */
  pushCheckpoint: (
    nodes: Node[],
    edges: Edge[],
    options?: SnapshotOptions,
  ) => Promise<boolean>;
  /** Re-sends the body of the last failed checkpoint push. */
  retryCheckpoint: () => Promise<boolean>;
  /** True while a checkpoint push is running — the double-save guard source. */
  inFlight: boolean;
  /** True after a failed push until a retry (or a later push) succeeds. */
  checkpointError: boolean;
};

/**
 * Returns the storyboard history push API for one draft.
 *
 * @param draftId - The generation draft ID used to tag sentinel block shapes.
 */
export function useStoryboardHistoryPush(draftId: string): StoryboardHistoryPushApi {
  const queryClient = useQueryClient();

  const [inFlight, setInFlight] = useState(false);
  const [checkpointError, setCheckpointError] = useState(false);

  // Synchronous guard — state updates are async, the refusal must not be.
  const inFlightRef = useRef(false);
  // Body of the last failed POST, kept verbatim for retryCheckpoint.
  const lastFailedRef = useRef<{
    snapshot: StoryboardHistoryPayload;
    previewKind: HistoryPreviewKind;
  } | null>(null);

  const sendCheckpoint = useCallback(
    async (snapshot: StoryboardHistoryPayload, previewKind: HistoryPreviewKind): Promise<boolean> => {
      try {
        await pushCheckpointSnapshot(draftId, snapshot, previewKind);
        lastFailedRef.current = null;
        setCheckpointError(false);
        await queryClient.invalidateQueries({ queryKey: ['storyboard-history', draftId] });
        return true;
      } catch {
        lastFailedRef.current = { snapshot, previewKind };
        setCheckpointError(true);
        return false;
      }
    },
    [draftId, queryClient],
  );

  const pushCheckpoint = useCallback(
    async (
      currentNodes: Node[],
      currentEdges: Edge[],
      options: SnapshotOptions = {},
    ): Promise<boolean> => {
      // Double-save guard (AC-07b): one checkpoint at a time.
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      setInFlight(true);

      try {
        const base = buildSnapshot(draftId, currentNodes, currentEdges, options);
        // The push is unconditional — capture failure/timeout only flips previewKind (AC-04).
        const capture = await captureCanvasThumbnailWithFallback();
        const snapshot =
          capture.kind === 'screenshot' ? { ...base, thumbnail: capture.dataUrl } : base;
        return await sendCheckpoint(snapshot, capture.kind);
      } finally {
        inFlightRef.current = false;
        setInFlight(false);
      }
    },
    [draftId, sendCheckpoint],
  );

  const retryCheckpoint = useCallback(async (): Promise<boolean> => {
    const failed = lastFailedRef.current;
    if (!failed || inFlightRef.current) return false;
    inFlightRef.current = true;
    setInFlight(true);
    try {
      return await sendCheckpoint(failed.snapshot, failed.previewKind);
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, [sendCheckpoint]);

  // ── Legacy per-change push (until T14) ──────────────────────────────────────

  const pushSnapshot = useCallback(
    async (
      currentNodes: Node[],
      currentEdges: Edge[],
      options: SnapshotOptions & { persistImmediately?: boolean } = {},
    ): Promise<void> => {
      const snapshot = buildSnapshot(draftId, currentNodes, currentEdges, options);
      const createdAt = new Date().toISOString();

      queryClient.setQueryData<StoryboardHistorySnapshot[]>(
        ['storyboard-history', draftId],
        (entries = []) => [
          ...entries,
          {
            snapshot,
            createdAt,
          },
        ],
      );

      // Capture thumbnail after the optimistic row exists. The history panel can
      // show the minimap immediately, then upgrade the same row when capture ends.
      const thumbnail = await captureCanvasThumbnail();
      const snapshotWithThumbnail = {
        ...snapshot,
        ...(thumbnail !== null && { thumbnail }),
      };

      if (thumbnail !== null) {
        queryClient.setQueryData<StoryboardHistorySnapshot[]>(
          ['storyboard-history', draftId],
          (entries = []) =>
            entries.map((entry) =>
              entry.createdAt === createdAt
                ? { ...entry, snapshot: snapshotWithThumbnail }
                : entry,
            ),
        );
      }

      await pushHistory(snapshotWithThumbnail, { persistImmediately: options.persistImmediately });
    },
    [draftId, queryClient],
  );

  return { pushSnapshot, pushCheckpoint, retryCheckpoint, inFlight, checkpointError };
}
