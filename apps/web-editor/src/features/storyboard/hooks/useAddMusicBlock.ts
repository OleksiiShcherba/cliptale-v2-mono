import { useCallback } from 'react';
import type React from 'react';

import type { Edge, Node } from '@xyflow/react';

import type { StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';
import { getManualMusicBlockPosition } from '@/features/storyboard/utils/musicBlockLayout';

import type { StoryboardMusicSaveOverride } from './useStoryboardAutosave';
import { getMusicBlocksFromNodes, musicBlockToNode } from './useStoryboardMusic';

function nextMusicSortOrder(musicBlocks: readonly StoryboardMusicBlock[]): number {
  if (musicBlocks.length === 0) return 0;
  return Math.max(...musicBlocks.map((block) => block.sortOrder)) + 1;
}

type UseAddMusicBlockArgs = {
  draftId: string;
  nodes: Node[];
  edges: Edge[];
  orderedScenes: StoryboardBlock[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  saveNow: (override?: StoryboardMusicSaveOverride) => Promise<void>;
  onAfterAdd?: (nodes: Node[], edges: Edge[]) => void | Promise<void>;
};

type UseAddMusicBlockResult = {
  canAddMusicBlock: boolean;
  addMusicBlock: () => StoryboardMusicBlock | null;
};

/**
 * Creates manually added storyboard music blocks from the current scene range.
 *
 * The returned `addMusicBlock` callback appends a local React Flow music node,
 * schedules history persistence, and saves the created music block through the
 * autosave override path so it is included before React state finishes flushing.
 */
export function useAddMusicBlock({
  draftId,
  nodes,
  edges,
  orderedScenes,
  setNodes,
  saveNow,
  onAfterAdd,
}: UseAddMusicBlockArgs): UseAddMusicBlockResult {
  const canAddMusicBlock = orderedScenes.length > 0;

  const addMusicBlock = useCallback((): StoryboardMusicBlock | null => {
    const firstScene = orderedScenes[0];
    const lastScene = orderedScenes.at(-1);
    if (!draftId || !firstScene || !lastScene) return null;

    const existingMusicBlocks = getMusicBlocksFromNodes(nodes);
    const position = getManualMusicBlockPosition(firstScene, existingMusicBlocks);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const musicBlock: StoryboardMusicBlock = {
      id,
      draftId,
      name: `Music ${existingMusicBlocks.length + 1}`,
      sourceMode: 'generate_on_step3',
      prompt: 'Instrumental underscore for this storyboard.',
      compositionPlan: null,
      existingFileId: null,
      startSceneBlockId: firstScene.id,
      endSceneBlockId: lastScene.id,
      positionX: position.x,
      positionY: position.y,
      sortOrder: nextMusicSortOrder(existingMusicBlocks),
      volume: 0.8,
      fadeInS: 0,
      fadeOutS: 1,
      loopMode: 'trim',
      generationStatus: null,
      generationJobId: null,
      outputFileId: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    const musicNode = musicBlockToNode(musicBlock, orderedScenes);
    const nextNodes = [...nodes, musicNode];

    setNodes((prev) => [...prev, musicNode]);
    setTimeout(() => {
      void onAfterAdd?.(nextNodes, edges);
      void saveNow({ musicBlocks: getMusicBlocksFromNodes(nextNodes) });
    }, 0);

    return musicBlock;
  }, [draftId, edges, nodes, onAfterAdd, orderedScenes, saveNow, setNodes]);

  return { canAddMusicBlock, addMusicBlock };
}
