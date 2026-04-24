/**
 * Shared test fixtures for useStoryboardAutosave split test files.
 */

import type { Node, Edge } from '@xyflow/react';

export const DRAFT_ID = 'draft-1';

/** A minimal START sentinel node matching React Flow's Node shape. */
export const makeStartNode = (): Node => ({
  id: 'start',
  type: 'start',
  position: { x: 60, y: 200 },
  data: { label: 'START' },
});

/** A minimal scene-block node. */
export const makeSceneNode = (id = 'scene-abc'): Node => ({
  id,
  type: 'scene-block',
  position: { x: 300, y: 200 },
  data: {
    block: {
      id,
      draftId: DRAFT_ID,
      blockType: 'scene',
      name: 'Scene 1',
      prompt: 'A scene',
      durationS: 5,
      positionX: 300,
      positionY: 200,
      sortOrder: 1,
      style: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      mediaItems: [],
    },
  },
});

export const DEFAULT_NODES: Node[] = [makeStartNode()];
export const DEFAULT_EDGES: Edge[] = [];
