/**
 * useStoryboardHistoryPush — provides `pushSnapshot` for the storyboard canvas.
 *
 * Encapsulates the conversion from React Flow node/edge state to a
 * `CanvasSnapshot` and delegates to the history store's `push` function.
 * Extracted from `StoryboardPage` to keep the page shell under 300 lines.
 */

import { useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { push as pushHistory } from '../store/storyboard-history-store';

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Returns a stable `pushSnapshot` callback that converts React Flow state to a
 * `CanvasSnapshot` and pushes it onto the history stack.
 *
 * @param draftId - The generation draft ID used to tag sentinel block shapes.
 */
export function useStoryboardHistoryPush(draftId: string): {
  pushSnapshot: (nodes: Node[], edges: Edge[]) => void;
} {
  const pushSnapshot = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]): void => {
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
          durationS: 0,
          positionX: n.position.x,
          positionY: n.position.y,
          sortOrder: 0,
          style: null as string | null,
          createdAt: '',
          updatedAt: '',
          mediaItems: [] as [],
        }));

      pushHistory({
        blocks: [...sceneBlocks, ...sentinelBlocks],
        edges: currentEdges.map((e) => ({
          id: e.id,
          draftId,
          sourceBlockId: e.source,
          targetBlockId: e.target,
        })),
        positions,
      });
    },
    [draftId],
  );

  return { pushSnapshot };
}
