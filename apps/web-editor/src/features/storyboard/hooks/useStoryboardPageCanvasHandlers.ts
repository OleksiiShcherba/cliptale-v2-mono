import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import type {
  Connection,
  Edge as FlowEdge,
  EdgeChange,
  Node,
  NodeChange,
  OnEdgesChange,
  OnNodesChange,
} from '@xyflow/react';

import { BORDER } from '@/features/storyboard/components/storyboardPageStyles';

type UseStoryboardPageCanvasHandlersArgs = {
  edges: FlowEdge[];
  isGenerationBlocking: boolean;
  nodes: Node[];
  pushSnapshot: (nodes: Node[], edges: FlowEdge[]) => Promise<void>;
  saveNow: () => Promise<void>;
  setEdges: Dispatch<SetStateAction<FlowEdge[]>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
};

type UseStoryboardPageCanvasHandlersResult = {
  handleConnect: (connection: Connection) => void;
  handleEdgesChange: OnEdgesChange;
  handleNodesChange: OnNodesChange;
  isValidConnection: (connection: FlowEdge | Connection) => boolean;
};

export function useStoryboardPageCanvasHandlers({
  edges,
  isGenerationBlocking,
  nodes,
  pushSnapshot,
  saveNow,
  setEdges,
  setNodes,
}: UseStoryboardPageCanvasHandlersArgs): UseStoryboardPageCanvasHandlersResult {
  const isValidConnection = useCallback(
    (connection: FlowEdge | Connection): boolean => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      if (edges.some((edge) => edge.target === target)) return false;
      if (edges.some((edge) => edge.source === source)) return false;
      return true;
    },
    [edges],
  );

  const handleConnect = useCallback(
    (connection: Connection): void => {
      if (isGenerationBlocking) return;
      setEdges((prev) => {
        const next = addEdge({
          ...connection,
          id: crypto.randomUUID(),
          sourceHandle: connection.sourceHandle ?? 'exit',
          targetHandle: connection.targetHandle ?? 'income',
          style: { stroke: BORDER, strokeWidth: 2 },
        }, prev);
        void pushSnapshot(nodes, next);
        return next;
      });
      setTimeout(() => void saveNow(), 0);
    },
    [isGenerationBlocking, nodes, pushSnapshot, saveNow, setEdges],
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]): void => {
      if (isGenerationBlocking) return;
      const nonPositionChanges = changes.filter((change) => change.type !== 'position');
      setNodes((prev) => applyNodeChanges(nonPositionChanges, prev));
    },
    [isGenerationBlocking, setNodes],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]): void => {
      if (isGenerationBlocking) return;
      const hasStructuralChange = changes.some((change) => change.type === 'add' || change.type === 'remove');
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev);
        if (hasStructuralChange) void pushSnapshot(nodes, next);
        return next;
      });
      if (hasStructuralChange) setTimeout(() => void saveNow(), 0);
    },
    [isGenerationBlocking, nodes, pushSnapshot, saveNow, setEdges],
  );

  return { handleConnect, handleEdgesChange, handleNodesChange, isValidConnection };
}
