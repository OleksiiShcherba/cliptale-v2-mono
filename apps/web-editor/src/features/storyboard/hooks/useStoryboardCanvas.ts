/**
 * useStoryboardCanvas — handles page-load initialization and hydration.
 *
 * On mount:
 * 1. Calls POST /storyboards/:draftId/initialize (idempotent — seeds START/END).
 * 2. Calls GET /storyboards/:draftId to fetch current state.
 * 3. Converts StoryboardBlock[] and StoryboardEdge[] to React Flow Node[] and Edge[].
 *
 * Returns the React Flow nodes, edges, and a removeNode callback.
 */

import { useState, useEffect, useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { initializeStoryboard, fetchStoryboard } from '../api';
import type { StoryboardBlock, StoryboardEdge, SceneBlockNodeData, SentinelNodeData } from '../types';

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
};

/**
 * Initializes the storyboard canvas on page load.
 *
 * Calls `POST /storyboards/:draftId/initialize` (idempotent),
 * then `GET /storyboards/:draftId`, and hydrates React Flow state.
 */
export function useStoryboardCanvas(draftId: string): UseStoryboardCanvasResult {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable removeNode callback — updates nodes state locally (no API call yet).
  const removeNode = useCallback((nodeId: string): void => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    // Also remove edges connected to the removed node.
    setEdges((prev) =>
      prev.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
  }, []);

  useEffect(() => {
    if (!draftId) return;

    let cancelled = false;

    async function load(): Promise<void> {
      try {
        setIsLoading(true);
        setError(null);

        // Step 1 — seed START/END if not yet present (idempotent).
        await initializeStoryboard(draftId);

        // Step 2 — fetch full canvas state.
        const state = await fetchStoryboard(draftId);

        if (cancelled) return;

        // Step 3 — apply default positions on first visit, then convert to React Flow.
        const positionedBlocks = applyDefaultPositions(state.blocks);

        const flowNodes = positionedBlocks.map((block) =>
          blockToNode(block, removeNode),
        );
        const flowEdges = state.edges.map(edgeToFlowEdge);

        setNodes(flowNodes);
        setEdges(flowEdges);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load storyboard');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [draftId, removeNode]);

  return { nodes, edges, isLoading, error, setNodes, setEdges, removeNode };
}
