import { useCallback, useMemo, useState } from 'react';
import type React from 'react';

import type { Edge, Node } from '@xyflow/react';

import {
  fetchStoryboardMusic,
  generateStoryboardMusicBlock,
  updateStoryboardMusicBlock,
} from '@/features/storyboard/api';
import type {
  MusicBlockNodeData,
  SceneBlockNodeData,
  StoryboardBlock,
  StoryboardEdge,
  StoryboardMusicBlock,
  StoryboardMusicBlockUpdatePayload,
} from '@/features/storyboard/types';
import { toStoryboardMusicBlockSaveInput } from '@/features/storyboard/utils/musicBlockSaveInput';

import type { StoryboardMusicSaveOverride } from './useStoryboardAutosave';

type SceneOrderBlock = Pick<StoryboardBlock, 'id' | 'blockType' | 'sortOrder' | 'name'>;
type SceneOrderEdge = Pick<StoryboardEdge, 'sourceBlockId' | 'targetBlockId'>;

const SOURCE_LABELS = {
  existing: 'Existing track',
  generate_now: 'Generate now',
  generate_on_step3: 'Auto later',
} as const;

const STATUS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  ready: 'Ready',
  failed: 'Failed',
} as const;

function sceneDisplayName(block: Pick<StoryboardBlock, 'name' | 'sortOrder'>): string {
  return block.name?.trim() || `Scene ${String(block.sortOrder).padStart(2, '0')}`;
}

export function orderStoryboardSceneBlocks(
  blocks: readonly SceneOrderBlock[],
  edges: readonly SceneOrderEdge[],
): SceneOrderBlock[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const start = blocks.find((block) => block.blockType === 'start');
  const sceneIds = new Set(blocks.filter((block) => block.blockType === 'scene').map((block) => block.id));
  const outgoing = new Map(edges.map((edge) => [edge.sourceBlockId, edge.targetBlockId]));
  const ordered: SceneOrderBlock[] = [];
  const seen = new Set<string>();
  let cursor = start?.id ? outgoing.get(start.id) : undefined;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const block = blockById.get(cursor);
    if (!block) break;
    if (block.blockType === 'scene') ordered.push(block);
    cursor = outgoing.get(cursor);
  }

  const orderedIds = new Set(ordered.map((block) => block.id));
  const fallback = blocks
    .filter((block) => block.blockType === 'scene' && !orderedIds.has(block.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return [...ordered, ...fallback];
}

export function getSceneNodesInStoryOrder(nodes: readonly Node[], edges: readonly Edge[]): StoryboardBlock[] {
  const blocks = nodes
    .filter((node) => node.type === 'start' || node.type === 'end' || node.type === 'scene-block')
    .map((node): StoryboardBlock | null => {
      if (node.type === 'scene-block') {
        return (node.data as Partial<SceneBlockNodeData>).block ?? null;
      }
      return {
        id: node.id,
        draftId: '',
        blockType: node.type === 'start' ? 'start' : 'end',
        name: null,
        prompt: null,
        videoPrompt: null,
        durationS: 0,
        positionX: node.position.x,
        positionY: node.position.y,
        sortOrder: node.type === 'start' ? 0 : 9999,
        style: null,
        createdAt: '',
        updatedAt: '',
        mediaItems: [],
      };
    })
    .filter((block): block is StoryboardBlock => block !== null);

  const storyboardEdges = edges.map((edge) => ({
    sourceBlockId: edge.source,
    targetBlockId: edge.target,
  }));

  return orderStoryboardSceneBlocks(blocks, storyboardEdges) as StoryboardBlock[];
}

export function getMusicRangeInfo(
  musicBlock: StoryboardMusicBlock,
  orderedScenes: readonly StoryboardBlock[],
): { coveredSceneIds: string[]; rangeLabel: string } {
  const startIndex = orderedScenes.findIndex((scene) => scene.id === musicBlock.startSceneBlockId);
  const endIndex = orderedScenes.findIndex((scene) => scene.id === musicBlock.endSceneBlockId);
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    return { coveredSceneIds: [], rangeLabel: 'Range missing' };
  }

  const coveredScenes = orderedScenes.slice(startIndex, endIndex + 1);
  const startLabel = sceneDisplayName(orderedScenes[startIndex]);
  const endLabel = sceneDisplayName(orderedScenes[endIndex]);
  return {
    coveredSceneIds: coveredScenes.map((scene) => scene.id),
    rangeLabel: startIndex === endIndex ? startLabel : `${startLabel} - ${endLabel}`,
  };
}

export function getMusicBlockFromNode(node: Node): StoryboardMusicBlock | null {
  if (node.type !== 'music-block') return null;
  const musicBlock = (node.data as MusicBlockNodeData).musicBlock;
  return {
    ...musicBlock,
    positionX: node.position.x,
    positionY: node.position.y,
  };
}

export function getMusicBlocksFromNodes(nodes: readonly Node[]): StoryboardMusicBlock[] {
  return nodes
    .map(getMusicBlockFromNode)
    .filter((block): block is StoryboardMusicBlock => block !== null);
}

export function musicBlockToNode(
  musicBlock: StoryboardMusicBlock,
  orderedScenes: readonly StoryboardBlock[],
): Node {
  const rangeInfo = getMusicRangeInfo(musicBlock, orderedScenes);
  const generationStatus = musicBlock.sourceMode === 'existing'
    ? (musicBlock.existingFileId ? 'ready' : null)
    : musicBlock.generationStatus;

  return {
    id: musicBlock.id,
    type: 'music-block',
    position: { x: musicBlock.positionX, y: musicBlock.positionY },
    data: {
      musicBlock,
      rangeLabel: rangeInfo.rangeLabel,
      sourceLabel: SOURCE_LABELS[musicBlock.sourceMode],
      statusLabel: generationStatus ? STATUS_LABELS[generationStatus] : 'Pending',
      isActive: false,
      onEdit: () => {},
      onHover: () => {},
    } satisfies MusicBlockNodeData,
    draggable: true,
    deletable: false,
  };
}

function patchMusicBlocksIntoNodes(
  nodes: readonly Node[],
  blocks: readonly StoryboardMusicBlock[],
): Node[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return nodes.map((node) => {
    const block = byId.get(node.id);
    if (!block || node.type !== 'music-block') return node;
    return {
      ...node,
      position: { x: block.positionX, y: block.positionY },
      data: {
        ...(node.data as MusicBlockNodeData),
        musicBlock: block,
      } satisfies MusicBlockNodeData,
    };
  });
}

type UseStoryboardMusicArgs = {
  draftId: string;
  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  saveNow: (override?: StoryboardMusicSaveOverride) => Promise<void>;
};

export function useStoryboardMusic({
  draftId,
  nodes,
  setNodes,
  saveNow,
}: UseStoryboardMusicArgs): {
  musicBlocks: StoryboardMusicBlock[];
  activeMusicBlockId: string | null;
  setActiveMusicBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  isGeneratingMusicBlockId: string | null;
  musicError: string | null;
  commitMusicBlock: (musicBlock: StoryboardMusicBlock) => void;
  generateMusicBlock: (musicBlock: StoryboardMusicBlock) => Promise<void>;
  refreshMusicBlocks: () => Promise<void>;
} {
  const [activeMusicBlockId, setActiveMusicBlockId] = useState<string | null>(null);
  const [isGeneratingMusicBlockId, setIsGeneratingMusicBlockId] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const musicBlocks = useMemo(() => getMusicBlocksFromNodes(nodes), [nodes]);

  const commitMusicBlock = useCallback((musicBlock: StoryboardMusicBlock): void => {
    setMusicError(null);
    setNodes((prev) => {
      const next = prev.map((node) => {
        if (node.id !== musicBlock.id || node.type !== 'music-block') return node;
        return {
          ...node,
          position: { x: musicBlock.positionX, y: musicBlock.positionY },
          data: {
            ...(node.data as MusicBlockNodeData),
            musicBlock,
          } satisfies MusicBlockNodeData,
        };
      });
      setTimeout(() => {
        void saveNow({ musicBlocks: getMusicBlocksFromNodes(next) });
      }, 0);
      return next;
    });
  }, [saveNow, setNodes]);

  const refreshMusicBlocks = useCallback(async (): Promise<void> => {
    if (!draftId) return;
    const response = await fetchStoryboardMusic(draftId);
    setNodes((prev) => patchMusicBlocksIntoNodes(prev, response.items));
  }, [draftId, setNodes]);

  const generateMusicBlock = useCallback(async (musicBlock: StoryboardMusicBlock): Promise<void> => {
    if (!draftId || isGeneratingMusicBlockId) return;
    setMusicError(null);
    setIsGeneratingMusicBlockId(musicBlock.id);

    try {
      const saveInput = toStoryboardMusicBlockSaveInput(musicBlock);
      const { id: _id, draftId: _draftId, ...patch } = saveInput;
      await updateStoryboardMusicBlock(draftId, musicBlock.id, patch as StoryboardMusicBlockUpdatePayload);
      const response = await generateStoryboardMusicBlock(draftId, musicBlock.id);
      setNodes((prev) => patchMusicBlocksIntoNodes(prev, response.items));
    } catch (err: unknown) {
      setMusicError(err instanceof Error ? err.message : 'Could not generate music.');
    } finally {
      setIsGeneratingMusicBlockId(null);
    }
  }, [draftId, isGeneratingMusicBlockId, setNodes]);

  return {
    musicBlocks,
    activeMusicBlockId,
    setActiveMusicBlockId,
    isGeneratingMusicBlockId,
    musicError,
    commitMusicBlock,
    generateMusicBlock,
    refreshMusicBlocks,
  };
}
