import React from 'react';

import type {
  Connection,
  Edge,
  Edge as FlowEdge,
  Node,
  NodeMouseHandler,
  NodeTypes,
  OnConnect,
  OnEdgesChange,
  OnNodeDrag,
  OnNodesChange,
} from '@xyflow/react';

import type { UseStoryboardPlanGenerationResult } from '@/features/storyboard/hooks/useStoryboardPlanGeneration';
import type { GhostDragState } from '@/features/storyboard/hooks/useStoryboardDrag';
import type { UseStoryboardIllustrationsResult } from '@/features/storyboard/hooks/useStoryboardIllustrations';
import type { StoryboardMusicBlock, StoryboardSidebarTab } from '@/features/storyboard/types';

import { EffectsPanel } from './EffectsPanel';
import { LibraryPanel } from './LibraryPanel';
import { SidebarTab } from './SidebarTab';
import { StoryboardCanvas } from './StoryboardCanvas';
import { EffectsIcon, LibraryIcon, StoryboardIcon } from './storyboardIcons';
import { StoryboardHistoryPanel } from './StoryboardHistoryPanel';
import {
  StoryboardIllustrationControls,
  StoryboardPlanBlockingOverlay,
  StoryboardPlanControls,
} from './StoryboardPlanControls';
import { storyboardPageStyles as s, ERROR } from './storyboardPageStyles';

interface StoryboardPageWorkspaceProps {
  activeTab: StoryboardSidebarTab;
  setActiveTab: React.Dispatch<React.SetStateAction<StoryboardSidebarTab>>;
  draftId: string;
  selectedBlockId: string | null;
  onAddTemplate: (templateId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  isValidConnection: (connection: FlowEdge | Connection) => boolean;
  onNodeDragStart: OnNodeDrag;
  onNodeDrag: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  dragState: GhostDragState | null;
  onAddBlock: () => void;
  onAddMusicBlock: () => void;
  canAddMusicBlock: boolean;
  onNodeClick: NodeMouseHandler<Node>;
  isKnifeActive: boolean;
  onCutEdge: (edgeId: string) => void;
  isHistoryOpen: boolean;
  onCloseHistory: () => void;
  onRestore: (
    nodes: Node[],
    edges: Edge[],
    options?: {
      skipSave?: boolean;
      skipSnapshot?: boolean;
      deferSave?: boolean;
      musicBlocks?: StoryboardMusicBlock[];
    },
  ) => void;
  planGeneration: UseStoryboardPlanGenerationResult;
  illustrationGeneration: UseStoryboardIllustrationsResult;
  isPlanBlocking: boolean;
}

export function StoryboardPageWorkspace({
  activeTab,
  setActiveTab,
  draftId,
  selectedBlockId,
  onAddTemplate,
  isLoading,
  error,
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  dragState,
  onAddBlock,
  onAddMusicBlock,
  canAddMusicBlock,
  onNodeClick,
  isKnifeActive,
  onCutEdge,
  isHistoryOpen,
  onCloseHistory,
  onRestore,
  planGeneration,
  illustrationGeneration,
  isPlanBlocking,
}: StoryboardPageWorkspaceProps): React.ReactElement {
  return (
    <div style={s.body}>
      <nav style={s.sidebar} aria-label="Storyboard panel tabs" data-testid="storyboard-sidebar">
        <SidebarTab tab="storyboard" activeTab={activeTab} onSelect={setActiveTab} label="Storyboard" icon={<StoryboardIcon />} />
        <SidebarTab tab="library" activeTab={activeTab} onSelect={setActiveTab} label="Library" icon={<LibraryIcon />} />
        <SidebarTab tab="effects" activeTab={activeTab} onSelect={setActiveTab} label="Effects" icon={<EffectsIcon />} />
      </nav>

      {activeTab === 'library' && (
        <LibraryPanel
          draftId={draftId}
          onSwitchToStoryboard={() => setActiveTab('storyboard')}
          onAddTemplate={onAddTemplate}
        />
      )}
      {activeTab === 'effects' && <EffectsPanel selectedBlockId={selectedBlockId} />}

      <div style={s.canvasArea} data-testid="storyboard-canvas" aria-label="Storyboard canvas">
        <StoryboardPlanControls
          status={planGeneration.status}
          error={planGeneration.error}
          isBlocking={isPlanBlocking}
          onRetry={() => { void planGeneration.retry(); }}
        />
        <StoryboardIllustrationControls
          status={illustrationGeneration.status}
          phase={illustrationGeneration.phase}
          reference={illustrationGeneration.reference}
          error={illustrationGeneration.error}
          isBlocking={illustrationGeneration.isBlocking || isPlanBlocking}
          onStart={() => { void illustrationGeneration.start(); }}
        />
        {isLoading ? (
          <div style={s.canvasPlaceholder} data-testid="canvas-loading">Loading storyboard…</div>
        ) : error ? (
          <div style={{ ...s.canvasPlaceholder, color: ERROR }} data-testid="canvas-error">{error}</div>
        ) : (
          <StoryboardCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            dragState={dragState}
            onAddBlock={onAddBlock}
            onAddMusicBlock={onAddMusicBlock}
            canAddMusicBlock={canAddMusicBlock}
            onNodeClick={onNodeClick}
            cursorMode={isKnifeActive ? 'knife' : 'grab'}
            onCutEdge={onCutEdge}
          />
        )}
      </div>

      {isHistoryOpen && (
        <StoryboardHistoryPanel
          draftId={draftId}
          onClose={onCloseHistory}
          onRestore={onRestore}
        />
      )}

      {isPlanBlocking && <StoryboardPlanBlockingOverlay status={planGeneration.status} />}
    </div>
  );
}
