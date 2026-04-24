/**
 * Tests for useAddBlock — pure helper functions and the hook itself.
 *
 * Covers:
 * - findInsertionPoint: no blocks → null
 * - findInsertionPoint: all blocks connected → null
 * - findInsertionPoint: multiple disconnected blocks → first (by X) is chosen
 * - findInsertionPoint: START block without exit edge → START chosen
 * - nextSceneIndex: no scene nodes → 1
 * - nextSceneIndex: scene nodes present → max sortOrder + 1
 * - useAddBlock: addBlock appends a node with a valid UUID id (ST-FIX-4)
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { Node, Edge } from '@xyflow/react';

import { findInsertionPoint, nextSceneIndex, useAddBlock } from './useAddBlock';
import type { SceneBlockNodeData } from '../types';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeSceneNode(id: string, x: number, sortOrder: number): Node {
  return {
    id,
    type: 'scene-block',
    position: { x, y: 200 },
    data: {
      block: {
        id,
        draftId: 'draft-1',
        blockType: 'scene',
        name: `SCENE ${sortOrder}`,
        prompt: null,
        durationS: 5,
        positionX: x,
        positionY: 200,
        sortOrder,
        style: null,
        createdAt: '2026-04-22T00:00:00Z',
        updatedAt: '2026-04-22T00:00:00Z',
        mediaItems: [],
      },
      onRemove: () => undefined,
    } satisfies SceneBlockNodeData,
  };
}

function makeStartNode(id = 'start', x = 60): Node {
  return {
    id,
    type: 'start',
    position: { x, y: 200 },
    data: { label: 'START' },
  };
}

function makeEndNode(id = 'end', x = 900): Node {
  return {
    id,
    type: 'end',
    position: { x, y: 200 },
    data: { label: 'END' },
  };
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
  };
}

// ── findInsertionPoint tests ───────────────────────────────────────────────────

describe('findInsertionPoint', () => {
  it('returns null when there are no nodes', () => {
    expect(findInsertionPoint([], [])).toBeNull();
  });

  it('returns null when only an END node exists', () => {
    const nodes = [makeEndNode()];
    expect(findInsertionPoint(nodes, [])).toBeNull();
  });

  it('returns the START node when it has no exit edge and there are no scene nodes', () => {
    const nodes = [makeStartNode(), makeEndNode()];
    const edges: Edge[] = [];
    const result = findInsertionPoint(nodes, edges);
    expect(result?.id).toBe('start');
  });

  it('returns null when all eligible nodes (start + scenes) have exit edges', () => {
    const start = makeStartNode();
    const scene1 = makeSceneNode('s1', 340, 1);
    const end = makeEndNode();
    const edges = [makeEdge('start', 's1'), makeEdge('s1', 'end')];
    const nodes = [start, scene1, end];
    expect(findInsertionPoint(nodes, edges)).toBeNull();
  });

  it('returns the leftmost disconnected scene block when multiple are disconnected', () => {
    // s1 at x=340, s2 at x=620, s3 at x=900
    // Only start→s1 edge exists; s2 and s3 have no exit.
    const start = makeStartNode();
    const scene1 = makeSceneNode('s1', 340, 1);
    const scene2 = makeSceneNode('s2', 620, 2);
    const scene3 = makeSceneNode('s3', 900, 3);
    const end = makeEndNode('end', 1180);
    const edges = [makeEdge('start', 's1'), makeEdge('s1', 's2')];
    const nodes = [start, scene1, scene2, scene3, end];
    // s3 is leftmost without exit among s2 (no exit) and s3 (no exit)?
    // s2 is at x=620 < s3 at x=900, so s2 should be returned.
    const result = findInsertionPoint(nodes, edges);
    expect(result?.id).toBe('s2');
  });

  it('picks the leftmost eligible node by X position', () => {
    // Both s1 (x=340) and s2 (x=620) have no exit edge.
    const start = makeStartNode();
    const scene1 = makeSceneNode('s1', 340, 1);
    const scene2 = makeSceneNode('s2', 620, 2);
    const end = makeEndNode();
    // start has an exit edge; s1 and s2 do not.
    const edges = [makeEdge('start', 's1')];
    const nodes = [start, scene1, scene2, end];
    // s1 is at x=340, s2 at x=620 — s1 is leftmost with no exit.
    // But wait: start→s1 edge means start HAS an exit edge, but s1 also has no exit edge.
    // The edge start→s1 has source='start', so start is in sourceIds.
    // s1's id is 's1' — no edge has source='s1', so s1 is the first without exit.
    const result = findInsertionPoint(nodes, edges);
    expect(result?.id).toBe('s1');
  });

  it('handles a single scene node with no edges', () => {
    const nodes = [makeStartNode(), makeSceneNode('s1', 340, 1), makeEndNode()];
    // No edges at all → start (x=60) is the leftmost eligible node without exit.
    const result = findInsertionPoint(nodes, []);
    expect(result?.id).toBe('start');
  });

  it('handles START node already having exit edge — picks first scene without exit', () => {
    const start = makeStartNode();
    const scene1 = makeSceneNode('s1', 340, 1);
    const end = makeEndNode();
    const edges = [makeEdge('start', 's1')];
    const nodes = [start, scene1, end];
    // start has exit, s1 has no exit → s1 returned.
    const result = findInsertionPoint(nodes, edges);
    expect(result?.id).toBe('s1');
  });
});

// ── nextSceneIndex tests ───────────────────────────────────────────────────────

describe('nextSceneIndex', () => {
  it('returns 1 when there are no scene nodes', () => {
    const nodes = [makeStartNode(), makeEndNode()];
    expect(nextSceneIndex(nodes)).toBe(1);
  });

  it('returns 1 when the node list is empty', () => {
    expect(nextSceneIndex([])).toBe(1);
  });

  it('returns max sortOrder + 1 for a single scene node', () => {
    const nodes = [makeStartNode(), makeSceneNode('s1', 340, 3), makeEndNode()];
    expect(nextSceneIndex(nodes)).toBe(4);
  });

  it('returns max sortOrder + 1 for multiple scene nodes', () => {
    const nodes = [
      makeStartNode(),
      makeSceneNode('s1', 340, 1),
      makeSceneNode('s2', 620, 2),
      makeSceneNode('s3', 900, 5),
      makeEndNode(),
    ];
    expect(nextSceneIndex(nodes)).toBe(6);
  });

  it('ignores START and END nodes when computing index', () => {
    // Only START and END — no scenes — should return 1.
    const nodes = [makeStartNode(), makeEndNode()];
    expect(nextSceneIndex(nodes)).toBe(1);
  });
});

// ── useAddBlock hook tests (ST-FIX-4) ─────────────────────────────────────────

/** UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('useAddBlock — hook', () => {
  it('addBlock appends a node with a valid UUID id (not a local- prefix)', () => {
    const setNodes = vi.fn();
    const removeNode = vi.fn();
    const start = makeStartNode();
    const nodes: Node[] = [start, makeEndNode()];
    const edges: Edge[] = [];

    const { result } = renderHook(() =>
      useAddBlock({ nodes, edges, setNodes, onRemoveNode: removeNode }),
    );

    act(() => {
      result.current.addBlock();
    });

    // setNodes should have been called once.
    expect(setNodes).toHaveBeenCalledTimes(1);

    // Extract the new node from the setNodes call (functional updater form).
    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const nextNodes = updater(nodes);
    const newNode = nextNodes.find((n) => n.id !== start.id && n.id !== makeEndNode().id);

    expect(newNode).toBeTruthy();
    // The id must be a valid UUID v4, not a local- prefix.
    expect(newNode?.id).toMatch(UUID_REGEX);
    // The block.id inside data must match the node id.
    const data = newNode?.data as SceneBlockNodeData;
    expect(data?.block?.id).toBe(newNode?.id);
  });

  it('addBlock places the new node to the right of the insertion point', () => {
    const setNodes = vi.fn();
    const start = makeStartNode('start', 60);
    const nodes: Node[] = [start, makeEndNode()];
    const edges: Edge[] = [];

    const { result } = renderHook(() =>
      useAddBlock({ nodes, edges, setNodes, onRemoveNode: vi.fn() }),
    );

    act(() => {
      result.current.addBlock();
    });

    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const nextNodes = updater(nodes);
    const newNode = nextNodes.find((n) => n.type === 'scene-block');

    // New block should be 280px to the right of the start node (x=60).
    expect(newNode?.position.x).toBe(60 + 280);
  });

  it('addBlock assigns scene-block type and correct sortOrder', () => {
    const setNodes = vi.fn();
    const scene1 = makeSceneNode('s1', 340, 3);
    const nodes: Node[] = [makeStartNode(), scene1, makeEndNode()];
    const edges: Edge[] = [makeEdge('start', 's1')];

    const { result } = renderHook(() =>
      useAddBlock({ nodes, edges, setNodes, onRemoveNode: vi.fn() }),
    );

    act(() => {
      result.current.addBlock();
    });

    const updater = setNodes.mock.calls[0][0] as (prev: Node[]) => Node[];
    const nextNodes = updater(nodes);
    const newNode = nextNodes.find((n) => n.type === 'scene-block' && n.id !== 's1');

    expect(newNode?.type).toBe('scene-block');
    const data = newNode?.data as SceneBlockNodeData;
    // sortOrder = max(3) + 1 = 4
    expect(data?.block?.sortOrder).toBe(4);
  });
});
