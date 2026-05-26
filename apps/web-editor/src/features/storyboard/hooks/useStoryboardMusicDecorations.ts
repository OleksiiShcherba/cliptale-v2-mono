import { useEffect } from 'react';
import type React from 'react';

import type { Node } from '@xyflow/react';

import type {
  MusicBlockNodeData,
  SceneBlockNodeData,
  StoryboardBlock,
  StoryboardMusicBlock,
} from '@/features/storyboard/types';

import { getMusicRangeInfo, musicBlockToNode } from './useStoryboardMusic';

type UseStoryboardMusicDecorationsArgs = {
  activeMusicBlockId: string | null;
  editingMusicBlockId: string | null;
  musicBlocks: StoryboardMusicBlock[];
  orderedScenes: StoryboardBlock[];
  setActiveMusicBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingMusicBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
};

export function useStoryboardMusicDecorations({
  activeMusicBlockId,
  editingMusicBlockId,
  musicBlocks,
  orderedScenes,
  setActiveMusicBlockId,
  setEditingMusicBlockId,
  setNodes,
}: UseStoryboardMusicDecorationsArgs): void {
  useEffect(() => {
    setNodes((prev) => {
      const sceneCoverage = new Map<string, number>();
      const highlightedScenes = new Set<string>();
      for (const musicBlock of musicBlocks) {
        const range = getMusicRangeInfo(musicBlock, orderedScenes);
        for (const sceneId of range.coveredSceneIds) {
          sceneCoverage.set(sceneId, (sceneCoverage.get(sceneId) ?? 0) + 1);
          if (musicBlock.id === activeMusicBlockId || musicBlock.id === editingMusicBlockId) {
            highlightedScenes.add(sceneId);
          }
        }
      }

      let changed = false;
      const next = prev.map((node) => {
        if (node.type === 'scene-block') {
          const data = node.data as SceneBlockNodeData;
          const count = sceneCoverage.get(node.id) ?? 0;
          const isHighlighted = highlightedScenes.has(node.id);
          const current = data.musicCoverage;
          if ((current?.count ?? 0) === count && (current?.isHighlighted ?? false) === isHighlighted) {
            return node;
          }
          changed = true;
          return {
            ...node,
            data: {
              ...data,
              musicCoverage: count > 0 ? { count, isHighlighted } : undefined,
            } satisfies SceneBlockNodeData,
          };
        }

        if (node.type !== 'music-block') return node;
        const data = node.data as MusicBlockNodeData;
        const currentMusicBlock = {
          ...data.musicBlock,
          positionX: node.position.x,
          positionY: node.position.y,
        };
        const derived = musicBlockToNode(currentMusicBlock, orderedScenes).data as MusicBlockNodeData;
        const isActive = node.id === activeMusicBlockId || node.id === editingMusicBlockId;
        if (
          data.musicBlock.positionX === node.position.x &&
          data.musicBlock.positionY === node.position.y &&
          data.rangeLabel === derived.rangeLabel &&
          data.sourceLabel === derived.sourceLabel &&
          data.statusLabel === derived.statusLabel &&
          data.isActive === isActive &&
          data.onEdit === setEditingMusicBlockId &&
          data.onHover === setActiveMusicBlockId
        ) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: {
            ...data,
            musicBlock: currentMusicBlock,
            rangeLabel: derived.rangeLabel,
            sourceLabel: derived.sourceLabel,
            statusLabel: derived.statusLabel,
            isActive,
            onEdit: setEditingMusicBlockId,
            onHover: setActiveMusicBlockId,
          } satisfies MusicBlockNodeData,
        };
      });
      return changed ? next : prev;
    });
  }, [
    activeMusicBlockId,
    editingMusicBlockId,
    musicBlocks,
    orderedScenes,
    setActiveMusicBlockId,
    setEditingMusicBlockId,
    setNodes,
  ]);
}
