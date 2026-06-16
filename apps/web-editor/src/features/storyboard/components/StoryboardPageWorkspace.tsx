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

import { AuthContext } from '@/features/auth/hooks/useAuth';
import { triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';
import { useStoryboardHiddenBlocks } from '@/features/storyboard/hooks/useStoryboardHiddenBlocks';
import type { UseStoryboardPlanGenerationResult } from '@/features/storyboard/hooks/useStoryboardPlanGeneration';
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
  StoryboardPlanControls,
} from './StoryboardPlanControls';
import {
  StoryboardRegenerateConfirmModal,
  type StoryboardRegenerateLossCategory,
} from './StoryboardRegenerateConfirmModal';
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
  /** Draft owner's user id — compared against the signed-in user for the owner gate (AC-09). */
  draftOwnerId: string | null;
  /** Whether the draft currently has any music block — drives loss enumeration (AC-08). */
  hasMusic: boolean;
  /** Optional — opens the cast extraction modal (storyboard-reference-flows AC-01). */
  onStartReferenceGeneration?: () => void;
  /** Incremented after pipeline reloads — forwarded to StoryboardCanvas for fitView. */
  fitViewTrigger?: number;
  /** Current pipeline state — forwarded to StoryboardCanvas for StepCorners. */
  pipelineState?: PipelineState | null;
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
  draftOwnerId,
  hasMusic,
  onStartReferenceGeneration,
  fitViewTrigger,
  pipelineState,
}: StoryboardPageWorkspaceProps): React.ReactElement {
  // AC-09 owner gate: only the draft's owner ever sees the status menu. Read the
  // auth context defensively — outside an AuthProvider (e.g. isolated tests) the
  // gate simply closes (no menu) rather than throwing.
  const user = React.useContext(AuthContext)?.user ?? null;
  const isOwner = Boolean(user && draftOwnerId && user.userId === draftOwnerId);

  const hiddenBlocks = useStoryboardHiddenBlocks({
    planStatus: planGeneration.status,
    illustrationStatus: illustrationGeneration.status,
  });

  // The destructive scene Regenerate is gated by a single confirm modal (AC-05).
  const [isSceneConfirmOpen, setIsSceneConfirmOpen] = React.useState(false);

  // AC-08: enumerate only the loss categories that presently exist in the draft.
  const sceneLosses = React.useMemo<StoryboardRegenerateLossCategory[]>(() => {
    const losses: StoryboardRegenerateLossCategory[] = [];
    if (nodes.some((node) => node.type === 'scene-block')) losses.push('scenes');
    if (illustrationGeneration.status === 'completed') losses.push('illustrations');
    if (hasMusic) losses.push('music');
    return losses;
  }, [nodes, illustrationGeneration.status, hasMusic]);

  const handleSceneRegenerate = React.useCallback(() => {
    setIsSceneConfirmOpen(true);
  }, []);

  const handleSceneRegenerateConfirm = React.useCallback(() => {
    // Close first so a duplicate confirm has no modal to act on, then trigger
    // the scene phase via the pipeline API — the block leaves its completed
    // state at once (status → queued), so its menu unmounts too (AC-01, AC-07).
    setIsSceneConfirmOpen(false);
    void triggerPhase(draftId, 'scene').catch((err: unknown) => {
      console.error('[StoryboardPageWorkspace] triggerPhase scene failed:', err);
    });
  }, [draftId]);

  const handleSceneRegenerateCancel = React.useCallback(() => {
    setIsSceneConfirmOpen(false);
  }, []);

  // AC-03: illustration Regenerate is additive — start directly, no confirmation.
  const handleIllustrationRegenerate = React.useCallback(() => {
    void illustrationGeneration.start();
  }, [illustrationGeneration]);

  const handlePlanHide = React.useCallback(() => hiddenBlocks.hide('plan'), [hiddenBlocks]);
  const handleIllustrationHide = React.useCallback(
    () => hiddenBlocks.hide('illustration'),
    [hiddenBlocks],
  );

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
        {!hiddenBlocks.isHidden('plan') && (
          <StoryboardPlanControls
            status={planGeneration.status}
            error={planGeneration.error}
            isBlocking={isPlanBlocking}
            onRetry={() => { void planGeneration.retry(); }}
            isOwner={isOwner}
            onRegenerate={handleSceneRegenerate}
            onHide={handlePlanHide}
          />
        )}
        {!hiddenBlocks.isHidden('illustration') && (
          <StoryboardIllustrationControls
            status={illustrationGeneration.status}
            phase={illustrationGeneration.phase}
            error={illustrationGeneration.gateError ? null : illustrationGeneration.error}
            hasStructuredGateError={illustrationGeneration.gateError !== null}
            isOwner={isOwner}
            onRegenerate={handleIllustrationRegenerate}
            onHide={handleIllustrationHide}
            reflowToTop={hiddenBlocks.isHidden('plan')}
          />
        )}
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
            onAddBlock={onAddBlock}
            onAddMusicBlock={onAddMusicBlock}
            canAddMusicBlock={canAddMusicBlock}
            onNodeClick={onNodeClick}
            cursorMode={isKnifeActive ? 'knife' : 'grab'}
            onCutEdge={onCutEdge}
            onStartReferenceGeneration={onStartReferenceGeneration}
            fitViewTrigger={fitViewTrigger}
            pipelineState={pipelineState}
            draftId={draftId}
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

      {isSceneConfirmOpen && (
        <StoryboardRegenerateConfirmModal
          losses={sceneLosses}
          onConfirm={handleSceneRegenerateConfirm}
          onCancel={handleSceneRegenerateCancel}
        />
      )}
    </div>
  );
}
