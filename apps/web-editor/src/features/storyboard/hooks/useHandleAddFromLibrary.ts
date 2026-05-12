/**
 * useHandleAddFromLibrary — adds a scene-template block to the React Flow canvas.
 *
 * Keeps StoryboardPage focused on wiring while preserving the same add/save/history
 * behavior used by the toolbar Add Block path.
 */

import { useCallback } from 'react';

import type { Edge, Node } from '@xyflow/react';

import { addTemplateToStoryboard } from '../api';
import { findInsertionPoint, nextSceneIndex } from './useAddBlock';

const NEW_BLOCK_X_OFFSET = 280;
const FALLBACK_X = 60;
const FALLBACK_Y = 200;

type UseHandleAddFromLibraryArgs = {
  draftId: string;
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  removeNode: (nodeId: string) => void;
  saveNow: () => Promise<void>;
  onAfterAdd: (nodes: Node[], edges: Edge[]) => void | Promise<void>;
};

export function useHandleAddFromLibrary({
  draftId,
  nodes,
  edges,
  setNodes,
  removeNode,
  saveNow,
  onAfterAdd,
}: UseHandleAddFromLibraryArgs): (templateId: string) => Promise<void> {
  return useCallback(
    async (templateId: string): Promise<void> => {
      const block = await addTemplateToStoryboard({ templateId, draftId });
      const insertAfter = findInsertionPoint(nodes, edges);
      const newX = insertAfter
        ? (insertAfter.position?.x ?? FALLBACK_X) + NEW_BLOCK_X_OFFSET
        : FALLBACK_X;
      const newY = insertAfter ? (insertAfter.position?.y ?? FALLBACK_Y) : FALLBACK_Y;
      const sceneIndex = nextSceneIndex(nodes);

      const newNode: Node = {
        id: block.id,
        type: 'scene-block',
        position: { x: newX, y: newY },
        data: {
          block: { ...block, positionX: newX, positionY: newY, sortOrder: block.sortOrder ?? sceneIndex },
          onRemove: removeNode,
        },
        draggable: true,
        deletable: true,
      };

      const nextNodes = [...nodes, newNode];
      setNodes((prev) => [...prev, newNode]);
      setTimeout(() => {
        void onAfterAdd(nextNodes, edges);
        void saveNow();
      }, 0);
    },
    [draftId, nodes, edges, removeNode, setNodes, onAfterAdd, saveNow],
  );
}
