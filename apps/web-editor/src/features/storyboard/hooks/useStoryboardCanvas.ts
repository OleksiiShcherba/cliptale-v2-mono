/**
 * useStoryboardCanvas — handles page-load initialization and hydration.
 *
 * On mount:
 * 1. Calls GET /storyboards/:draftId to fetch current state.
 *    The GET endpoint atomically seeds START/END sentinels on the server side,
 *    so no separate POST /initialize call is needed.
 * 2. Client-side dedup: keeps only the first START and first END block so that
 *    any pre-existing duplicate sentinels in the DB are filtered before render.
 * 3. Converts StoryboardBlock[] and StoryboardEdge[] to React Flow Node[] and Edge[].
 *
 * Returns the React Flow nodes, edges, and a removeNode callback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { fetchFileInfo, fetchStoryboard, listReferenceBlocks, updateReferenceBlock } from '@/features/storyboard/api';
import type {
  ReferenceBlockApiResponse,
  ReferenceBlockNodeData,
  SceneBlockNodeData,
  SentinelNodeData,
  StoryboardBlock,
  StoryboardEdge,
} from '@/features/storyboard/types';
import {
  STORYBOARD_MUSIC_NODE_LANE_HEIGHT,
  STORYBOARD_MUSIC_NODE_VERTICAL_GAP,
  STORYBOARD_SCENE_NODE_RENDERED_HEIGHT,
} from '@/features/storyboard/utils/musicBlockLayout';
import { musicBlockToNode, orderStoryboardSceneBlocks } from './useStoryboardMusic';

// ── Canvas layout constants ────────────────────────────────────────────────────

/** Horizontal gap between nodes when laying out the initial canvas. */
const INITIAL_LAYOUT_X_GAP = 280;

/** Vertical center of the canvas — nodes are placed on this Y baseline. */
const CANVAS_CENTER_Y = 200;

// ── Conversion helpers ─────────────────────────────────────────────────────────

/**
 * Converts a StoryboardBlock to a React Flow Node.
 * START/END blocks use sentinel node types; SCENE blocks use the scene-block type.
 */
function blockToNode(
  block: StoryboardBlock,
  onRemove: (nodeId: string) => void,
): Node {
  const position = {
    x: block.positionX,
    y: block.positionY,
  };

  if (block.blockType === 'start') {
    return {
      id: block.id,
      type: 'start',
      position,
      data: { label: 'START' } satisfies SentinelNodeData,
      draggable: true,
      deletable: false,
    };
  }

  if (block.blockType === 'end') {
    return {
      id: block.id,
      type: 'end',
      position,
      data: { label: 'END' } satisfies SentinelNodeData,
      draggable: true,
      deletable: false,
    };
  }

  // Scene block
  return {
    id: block.id,
    type: 'scene-block',
    position,
    data: { block, onRemove } satisfies SceneBlockNodeData,
    draggable: true,
    deletable: true,
  };
}

/**
 * Converts a StoryboardEdge to a React Flow Edge.
 * Uses source/target handle IDs matching StartNode/EndNode/SceneBlockNode.
 */
function edgeToFlowEdge(edge: StoryboardEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: 'exit',
    target: edge.targetBlockId,
    targetHandle: 'income',
    style: { stroke: '#252535', strokeWidth: 2 },
  };
}

/**
 * Vertical offset applied to reference-block nodes so they render below the main
 * story row. Persisted positionY is display-y minus this offset (round-trips on
 * reload). Exported so the drag-persist path stays in sync with the layout.
 */
export const REFERENCE_BLOCK_Y_OFFSET = 350;

// ── Reference block auto-layout constants ─────────────────────────────────────

/** Gap between the bottom of the music-block row and the first reference row. */
const REFERENCE_BLOCK_GAP_FROM_MUSIC = 40;

/** Approximate rendered height of one reference-block node. */
const REFERENCE_BLOCK_NODE_HEIGHT = 180;

/** Vertical spacing between reference blocks stacked under the same scene. */
const REFERENCE_BLOCK_NODE_VERTICAL_SPACING = 20;

/**
 * Computes the default canvas position for a reference block when it has not yet
 * been manually placed (positionX === 0 && positionY === 0).
 *
 * Layout rules (per product spec):
 * - X: aligned to the first scene block the reference is connected to.
 * - Y: below the shared music-block row; multiple references from the same first
 *   scene are stacked vertically.
 *
 * Returns null when the first linked scene cannot be found (e.g., newly created
 * reference before scene blocks exist) — the caller falls back to the (0, 0) default.
 */
function computeDefaultReferenceBlockPosition(
  block: ReferenceBlockApiResponse,
  sceneBlocksById: Map<string, StoryboardBlock>,
  countByFirstSceneId: Map<string, number>,
): { x: number; y: number } | null {
  if (block.positionX !== 0 || block.positionY !== 0) return null;

  const firstSceneId = block.sceneBlockIds[0];
  if (!firstSceneId) return null;

  const firstScene = sceneBlocksById.get(firstSceneId);
  if (!firstScene) return null;

  // Music row: all music blocks are on one horizontal line below scene nodes.
  const musicRowY = firstScene.positionY + STORYBOARD_SCENE_NODE_RENDERED_HEIGHT + STORYBOARD_MUSIC_NODE_VERTICAL_GAP;
  const referenceRowStartY = musicRowY + STORYBOARD_MUSIC_NODE_LANE_HEIGHT + REFERENCE_BLOCK_GAP_FROM_MUSIC;

  // Stack vertically when multiple references share the same first scene.
  const stackIndex = countByFirstSceneId.get(firstSceneId) ?? 0;
  countByFirstSceneId.set(firstSceneId, stackIndex + 1);

  const canvasY = referenceRowStartY
    + stackIndex * (REFERENCE_BLOCK_NODE_HEIGHT + REFERENCE_BLOCK_NODE_VERTICAL_SPACING);

  // storedY = canvasY − REFERENCE_BLOCK_Y_OFFSET (offset is re-added on render).
  return { x: firstScene.positionX, y: canvasY - REFERENCE_BLOCK_Y_OFFSET };
}

/**
 * Converts a ReferenceBlockApiResponse to a React Flow Node (off-chain, like musicBlockToNode).
 * The node type is 'reference-block' — registered in STORYBOARD_NODE_TYPES.
 *
 * `resolvedPreviewUrls` are the pre-fetched URLs for ALL the block's starred
 * files, oldest-first (AC-06) — every star surfaces in the preview.
 * Pass [] when nothing is starred or no URL could be resolved.
 */
function referenceBlockToNode(
  block: ReferenceBlockApiResponse,
  onOpenFlow: (blockId: string) => void,
  onRetry: (blockId: string) => void,
  resolvedPreviewUrls: string[] = [],
  onOpenDetails?: (blockId: string) => void,
  defaultPosition?: { x: number; y: number } | null,
): Node {
  // Use computed default position when block has not yet been manually placed.
  const storedX = defaultPosition?.x ?? block.positionX;
  const storedY = defaultPosition?.y ?? block.positionY;

  const data: ReferenceBlockNodeData = {
    referenceBlock: {
      id: block.blockId,
      draftId: block.draftId,
      flowId: block.flowId,
      castType: block.castType,
      name: block.name,
      description: block.description,
      sortOrder: block.sortOrder,
      positionX: storedX,
      positionY: storedY,
      windowStatus: block.windowStatus,
      firstJobId: null,
      errorMessage: block.errorMessage,
      version: block.version,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    },
    previewUrls: resolvedPreviewUrls,
    sceneBlockIds: block.sceneBlockIds,
    onOpenFlow,
    onOpenDetails,
    onRetry,
  };

  return {
    id: block.blockId,
    type: 'reference-block',
    position: { x: storedX, y: storedY + REFERENCE_BLOCK_Y_OFFSET }, // REFERENCE_BLOCK_Y_OFFSET added on render
    data,
    draggable: true,
    deletable: true,
  };
}

/**
 * Deduplicates sentinel blocks: keeps only the first START and first END block.
 * All scene blocks are kept unchanged. This is a client-side safety net for
 * pre-existing duplicate sentinels in the DB caused by the prior race condition.
 */
function dedupSentinels(blocks: StoryboardBlock[]): StoryboardBlock[] {
  return blocks.filter(
    (b, i, arr) =>
      b.blockType === 'scene' ||
      arr.findIndex((x) => x.blockType === b.blockType) === i,
  );
}

/**
 * Assigns fallback positions for START/END blocks when the server returns (0,0).
 * This occurs on first visit before the user has manually arranged nodes.
 */
function applyDefaultPositions(blocks: StoryboardBlock[]): StoryboardBlock[] {
  const startBlock = blocks.find((b) => b.blockType === 'start');
  const endBlock = blocks.find((b) => b.blockType === 'end');

  // Only override if both are at default (0,0) position.
  const isDefault =
    startBlock &&
    endBlock &&
    startBlock.positionX === 0 &&
    startBlock.positionY === 0 &&
    endBlock.positionX === 0 &&
    endBlock.positionY === 0;

  if (!isDefault) return blocks;

  const sceneCount = blocks.filter((b) => b.blockType === 'scene').length;
  const totalNodes = 2 + sceneCount; // START + scenes + END
  const totalWidth = (totalNodes - 1) * INITIAL_LAYOUT_X_GAP;

  return blocks.map((block) => {
    if (block.blockType === 'start') {
      return { ...block, positionX: 60, positionY: CANVAS_CENTER_Y };
    }
    if (block.blockType === 'end') {
      return { ...block, positionX: 60 + totalWidth, positionY: CANVAS_CENTER_Y };
    }
    // Scene blocks keep their sortOrder-based offset.
    return {
      ...block,
      positionX: 60 + block.sortOrder * INITIAL_LAYOUT_X_GAP,
      positionY: CANVAS_CENTER_Y,
    };
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  isLoading: boolean;
  error: string | null;
};

type UseStoryboardCanvasResult = CanvasState & {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  removeNode: (nodeId: string) => void;
  reload?: () => Promise<void>;
};

type UseStoryboardCanvasOptions = {
  /** Opens the reference details modal on block click (scene links + prompt). */
  onOpenReferenceDetails?: (blockId: string) => void;
  /** Called when a reference block node is clicked (opens the linked flow). Default: no-op. */
  onOpenReferenceFlow?: (blockId: string) => void;
  /** Called when the retry button is clicked on a failed reference block. Default: no-op. */
  onRetryReferenceBlock?: (blockId: string) => void;
};

/**
 * Initializes the storyboard canvas on page load.
 *
 * Calls `GET /storyboards/:draftId` (which seeds sentinels server-side),
 * deduplicates any pre-existing duplicate sentinels, and hydrates React Flow state.
 * Also fetches reference blocks from `GET /storyboards/:draftId/references/blocks`
 * and adds them as `'reference-block'` nodes below the main story row.
 */
export function useStoryboardCanvas(
  draftId: string,
  options: UseStoryboardCanvasOptions = {},
): UseStoryboardCanvasResult {
  const { onOpenReferenceFlow, onRetryReferenceBlock, onOpenReferenceDetails } = options;
  // Use stable ref wrappers so the reload callback doesn't change when the callbacks change.
  const onOpenFlowRef = useRef<(blockId: string) => void>(onOpenReferenceFlow ?? (() => { /* no-op */ }));
  const onRetryRef = useRef<(blockId: string) => void>(onRetryReferenceBlock ?? (() => { /* no-op */ }));
  const onOpenDetailsRef = useRef<((blockId: string) => void) | undefined>(onOpenReferenceDetails);
  useEffect(() => {
    if (onOpenReferenceFlow) onOpenFlowRef.current = onOpenReferenceFlow;
  }, [onOpenReferenceFlow]);
  useEffect(() => {
    if (onRetryReferenceBlock) onRetryRef.current = onRetryReferenceBlock;
  }, [onRetryReferenceBlock]);
  useEffect(() => {
    if (onOpenReferenceDetails) onOpenDetailsRef.current = onOpenReferenceDetails;
  }, [onOpenReferenceDetails]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const activeDraftIdRef = useRef(draftId);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stable removeNode callback — updates nodes state locally (no API call yet).
  const removeNode = useCallback((nodeId: string): void => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    // Also remove edges connected to the removed node.
    setEdges((prev) =>
      prev.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    if (!draftId) return;

    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;
    activeDraftIdRef.current = draftId;
    setIsLoading(true);
    setError(null);

    try {
      // Fetch canvas state and reference blocks in parallel.
      // listReferenceBlocks is caught defensively so a missing/unavailable API degrades
      // gracefully (e.g., non-reference-flows storyboards, or test environments where
      // only fetchStoryboard is mocked).
      const safeListReferenceBlocks = (): Promise<{ items: ReferenceBlockApiResponse[] }> => {
        try {
          return listReferenceBlocks(draftId).catch(() => ({ items: [] as ReferenceBlockApiResponse[] }));
        } catch {
          return Promise.resolve({ items: [] });
        }
      };
      const [state, refBlocksResult] = await Promise.all([
        fetchStoryboard(draftId),
        safeListReferenceBlocks(),
      ]);

      // Resolve preview URLs for ALL starred files of every reference block —
      // each star means "used as a reference in scenes" and surfaces in the
      // block preview (AC-06). previewFileId remains the no-stars fallback.
      const previewUrlMap = new Map<string, string>();
      const fileIdsNeedingUrl = [
        ...new Set(
          refBlocksResult.items.flatMap((b) => [
            ...b.stars.map((s) => s.fileId),
            ...(b.previewFileId != null ? [b.previewFileId] : []),
          ]),
        ),
      ];
      if (fileIdsNeedingUrl.length > 0) {
        const urlFetches = fileIdsNeedingUrl.map(async (fileId) => {
          try {
            const info = await fetchFileInfo(fileId);
            if (info?.url) previewUrlMap.set(fileId, info.url);
          } catch {
            // Ignore individual fetch failures (including missing mock in tests).
          }
        });
        await Promise.all(urlFetches);
      }

      // Dedup: keep only first START + first END (safety net for legacy duplicates).
      const dedupedBlocks = dedupSentinels(state.blocks);

      // Apply default positions on first visit, then convert to React Flow.
      const positionedBlocks = applyDefaultPositions(dedupedBlocks);

      const orderedScenes = orderStoryboardSceneBlocks(positionedBlocks, state.edges);

      // Build lookup for reference block auto-layout: X aligned to first scene, Y below music row.
      const sceneBlocksById = new Map(
        positionedBlocks.filter((b) => b.blockType === 'scene').map((b) => [b.id, b]),
      );
      const refCountByFirstSceneId = new Map<string, number>();

      // Compute default positions and collect blocks that need their positions persisted.
      const defaultPositions = new Map<string, { x: number; y: number }>();
      for (const refBlock of refBlocksResult.items) {
        const pos = computeDefaultReferenceBlockPosition(refBlock, sceneBlocksById, refCountByFirstSceneId);
        if (pos) defaultPositions.set(refBlock.blockId, pos);
      }

      const flowNodes = [
        ...positionedBlocks.map((block) => blockToNode(block, removeNode)),
        ...state.musicBlocks.map((musicBlock) => musicBlockToNode(musicBlock, orderedScenes as StoryboardBlock[])),
        ...refBlocksResult.items.map((refBlock) => {
          const defaultPos = defaultPositions.get(refBlock.blockId) ?? null;

          // All starred files, oldest-first; fall back to previewFileId when
          // nothing is starred (e.g. legacy/auto preview).
          const starUrls = refBlock.stars
            .map((s) => previewUrlMap.get(s.fileId))
            .filter((u): u is string => u != null);
          const fallbackUrl = refBlock.previewFileId
            ? previewUrlMap.get(refBlock.previewFileId)
            : undefined;
          const resolvedUrls = starUrls.length > 0
            ? starUrls
            : fallbackUrl != null ? [fallbackUrl] : [];
          return referenceBlockToNode(
            refBlock,
            (blockId) => { onOpenFlowRef.current(blockId); },
            (blockId) => { onRetryRef.current(blockId); },
            resolvedUrls,
            onOpenDetailsRef.current
              ? (blockId) => { onOpenDetailsRef.current?.(blockId); }
              : undefined,
            defaultPos,
          );
        }),
      ];
      const flowEdges = state.edges.map(edgeToFlowEdge);

      if (
        !isMountedRef.current
        || requestTokenRef.current !== token
        || activeDraftIdRef.current !== draftId
      ) return;
      setNodes(flowNodes);
      setEdges(flowEdges);

      // Persist computed default positions so they survive page refresh.
      // Fire-and-forget: display is already correct; errors are non-fatal.
      for (const [blockId, pos] of defaultPositions) {
        void updateReferenceBlock(draftId, blockId, {
          positionX: pos.x,
          positionY: pos.y,
        }).catch((err) => {
          console.error('[useStoryboardCanvas] failed to persist reference block default position:', err);
        });
      }
    } catch (err) {
      if (
        !isMountedRef.current
        || requestTokenRef.current !== token
        || activeDraftIdRef.current !== draftId
      ) return;
      setError(err instanceof Error ? err.message : 'Failed to load storyboard');
    } finally {
      if (
        isMountedRef.current
        && requestTokenRef.current === token
        && activeDraftIdRef.current === draftId
      ) setIsLoading(false);
    }
  }, [draftId, removeNode]);

  useEffect(() => {
    if (!draftId) return;

    void reload();
  }, [draftId, reload]);

  return { nodes, edges, isLoading, error, setNodes, setEdges, removeNode, reload };
}
