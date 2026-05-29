import type {
  MusicBlockNodeData,
  SceneBlockNodeData,
  SentinelNodeData,
  StoryboardBlock,
  StoryboardEdge,
  StoryboardMusicBlock,
} from '@/features/storyboard/types';

import { musicBlockToNode, orderStoryboardSceneBlocks } from './useStoryboardMusic';

export type StoryboardPlanFlowNode = {
  id: string;
  type: 'start' | 'end' | 'scene-block' | 'music-block';
  position: { x: number; y: number };
  data: SceneBlockNodeData | SentinelNodeData | MusicBlockNodeData;
  draggable: boolean;
  deletable: boolean;
};

export type StoryboardPlanFlowEdge = {
  id: string;
  source: string;
  sourceHandle: 'exit';
  target: string;
  targetHandle: 'income';
  style: { stroke: string; strokeWidth: number };
};

export type StoryboardPlanCanvasState = {
  nodes: StoryboardPlanFlowNode[];
  edges: StoryboardPlanFlowEdge[];
};

function blockToNode(
  block: StoryboardBlock,
  onRemoveNode: (nodeId: string) => void,
): StoryboardPlanFlowNode {
  const position = { x: block.positionX, y: block.positionY };

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

  return {
    id: block.id,
    type: 'scene-block',
    position,
    data: { block, onRemove: onRemoveNode } satisfies SceneBlockNodeData,
    draggable: true,
    deletable: true,
  };
}

function edgeToFlowEdge(edge: StoryboardEdge): StoryboardPlanFlowEdge {
  return {
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: 'exit',
    target: edge.targetBlockId,
    targetHandle: 'income',
    style: { stroke: '#252535', strokeWidth: 2 },
  };
}

export function toCanvasState(
  blocks: StoryboardBlock[],
  edges: StoryboardEdge[],
  musicBlocks: StoryboardMusicBlock[],
  onRemoveNode: (nodeId: string) => void,
): StoryboardPlanCanvasState {
  const orderedScenes = orderStoryboardSceneBlocks(blocks, edges);
  return {
    nodes: [
      ...blocks.map((block) => blockToNode(block, onRemoveNode)),
      ...musicBlocks.map((musicBlock) =>
        musicBlockToNode(musicBlock, orderedScenes as StoryboardBlock[]) as StoryboardPlanFlowNode,
      ),
    ],
    edges: edges.map(edgeToFlowEdge),
  };
}
