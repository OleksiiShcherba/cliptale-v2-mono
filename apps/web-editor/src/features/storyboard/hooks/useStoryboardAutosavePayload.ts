import type { Edge, Node } from '@xyflow/react';

import type { StoryboardSavePayload, StoryboardState } from '@/features/storyboard/types';
import { getMusicBlocksFromNodes } from '@/features/storyboard/hooks/useStoryboardMusic';
import { toStoryboardMusicBlockSaveInputs } from '@/features/storyboard/utils/musicBlockSaveInput';

export function stateKey(
  nodes: StoryboardState['blocks'],
  edges: StoryboardState['edges'],
  musicBlocks?: StoryboardSavePayload['musicBlocks'],
): string {
  return JSON.stringify({
    nodes,
    edges,
    ...(musicBlocks !== undefined && { musicBlocks }),
  });
}

export function comparableBlocks(nodes: Node[], draftId: string): StoryboardState['blocks'] {
  return nodes
    .filter((node) => node.type === 'scene-block' || node.type === 'start' || node.type === 'end')
    .map((node) => {
      if (node.type === 'scene-block') {
        const data = node.data as { block: StoryboardState['blocks'][number] };
        return {
          ...data.block,
          draftId,
          positionX: node.position.x,
          positionY: node.position.y,
        };
      }

      return {
        id: node.id,
        draftId,
        blockType: (node.type === 'start' ? 'start' : 'end') as 'start' | 'end',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 5,
        positionX: node.position.x,
        positionY: node.position.y,
        sortOrder: 0,
        style: null,
        createdAt: '',
        updatedAt: '',
        mediaItems: [],
      };
    });
}

export function comparableEdges(edges: Edge[], draftId: string): StoryboardState['edges'] {
  return edges.map((edge) => ({
    id: edge.id,
    draftId,
    sourceBlockId: edge.source,
    targetBlockId: edge.target,
  })) as StoryboardState['edges'];
}

export function musicBlocksForSave(nodes: Node[]): StoryboardSavePayload['musicBlocks'] {
  return toStoryboardMusicBlockSaveInputs(getMusicBlocksFromNodes(nodes)) ?? [];
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}
