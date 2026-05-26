/**
 * Shared test fixtures for useStoryboardDrag tests.
 */

import type { Node, Edge } from '@xyflow/react';

import type { MusicBlockNodeData, StoryboardMusicBlock } from '@/features/storyboard/types';

import { useStoryboardDrag } from './useStoryboardDrag';

// ── Node / edge builders ───────────────────────────────────────────────────────

export function makeSceneNode(
  id: string,
  x: number,
  y = 200,
  width = 220,
  height = 120,
): Node {
  return {
    id,
    type: 'scene-block',
    position: { x, y },
    measured: { width, height },
    data: {},
  };
}

/** Builds a hydrated storyboard music block fixture for drag tests. */
export function makeMusicBlock(overrides: Partial<StoryboardMusicBlock> = {}): StoryboardMusicBlock {
  return {
    id: 'music-1',
    draftId: 'draft-1',
    name: 'Opening music',
    sourceMode: 'generate_now',
    prompt: 'Soft pulse',
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: 'scene-1',
    endSceneBlockId: 'scene-2',
    positionX: 120,
    positionY: 520,
    sortOrder: 0,
    volume: 0.8,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: 'ready',
    generationJobId: 'job-1',
    outputFileId: 'file-1',
    errorMessage: null,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

/** Builds a React Flow music node fixture with complete MusicBlockNodeData. */
export function makeMusicNode(
  overrides: Partial<Node> = {},
  blockOverrides: Partial<StoryboardMusicBlock> = {},
): Node {
  const musicBlock = makeMusicBlock(blockOverrides);
  return {
    id: musicBlock.id,
    type: 'music-block',
    position: { x: musicBlock.positionX, y: musicBlock.positionY },
    measured: { width: 220, height: 144 },
    data: {
      musicBlock,
      rangeLabel: 'Opening - Close',
      sourceLabel: 'Generate now',
      statusLabel: 'Ready',
      isActive: false,
      onEdit: () => {},
      onHover: () => {},
    } satisfies MusicBlockNodeData,
    ...overrides,
  };
}

export function makeEdge(source: string, target: string): Edge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
  };
}

// ── Event-fire helpers ─────────────────────────────────────────────────────────

/** Simulates firing handleNodeDragStart with a given node. */
export function fireDragStart(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDragStart'],
  node: Node,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({} as any, node, []);
}

/** Simulates firing handleNodeDrag with cursor coords. */
export function fireDrag(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDrag'],
  node: Node,
  clientX: number,
  clientY: number,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({ clientX, clientY } as any, node, []);
}

/** Simulates firing handleNodeDragStop with a given node. */
export function fireDragStop(
  handler: ReturnType<typeof useStoryboardDrag>['handleNodeDragStop'],
  node: Node,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler({} as any, node, []);
}

// ── UUID v4 regex ──────────────────────────────────────────────────────────────

/**
 * Strict RFC 4122 v4 UUID pattern.
 * Rejects strings that are merely 36 characters of hex-and-hyphens.
 */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
