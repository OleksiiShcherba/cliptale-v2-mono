import type { Edge, Node } from '@xyflow/react';

import type { StoryboardState } from '@/features/storyboard/types';

/**
 * A lightweight canvas snapshot: graph structure, optional music blocks,
 * optional node positions, and an optional canvas thumbnail.
 */
export type CanvasSnapshot = {
  blocks: StoryboardState['blocks'];
  edges: StoryboardState['edges'];
  musicBlocks?: StoryboardState['musicBlocks'];
  positions?: Record<string, { x: number; y: number }>;
  thumbnail?: string;
};

export type AppliedCanvasSnapshot = {
  nodes: Node[];
  edges: Edge[];
  musicBlocks?: StoryboardState['musicBlocks'];
};
