import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';

vi.mock('@/lib/api-client', () => ({ buildAuthenticatedUrl: (u: string) => u }));
vi.mock('@/lib/config', () => ({ config: { apiBaseUrl: 'https://api.test' } }));
vi.mock('./StoryboardCanvas', () => ({
  StoryboardCanvas: () => <div data-testid="storyboard-canvas-stub" />,
}));

import { StoryboardPageWorkspace } from './StoryboardPageWorkspace';
import { AuthContext, type AuthContextValue } from '@/features/auth/hooks/useAuth';
import type { AuthUser } from '@/features/auth/types';
import type { UseStoryboardPlanGenerationResult } from '@/features/storyboard/hooks/useStoryboardPlanGeneration';
import type { UseStoryboardIllustrationsResult } from '@/features/storyboard/hooks/useStoryboardIllustrations';
import type {
  StoryboardIllustrationLifecycleStatus,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';

const OWNER_ID = 'owner-1';

function authValue(user: AuthUser | null): AuthContextValue {
  return { user, isLoading: false, setSession: vi.fn(), logout: vi.fn() };
}

function planGen(
  status: StoryboardPlanGenerationStatus,
  start: () => Promise<string | null>,
): UseStoryboardPlanGenerationResult {
  return { status, jobId: null, error: null, canvasState: null, start, retry: start, reset: vi.fn() };
}

function illusGen(
  status: StoryboardIllustrationLifecycleStatus,
  start: () => Promise<void>,
): UseStoryboardIllustrationsResult {
  return {
    status,
    phase: 'scene',
    error: null,
    reference: null,
    items: [],
    byBlockId: new Map(),
    isBlocking: false,
    start,
    retryBlock: vi.fn(),
    refresh: vi.fn(),
  };
}

function sceneNode(): Node {
  return { id: 's1', type: 'scene-block', position: { x: 0, y: 0 }, data: {} };
}

function renderWorkspace(opts: {
  user?: AuthUser | null;
  draftOwnerId?: string | null;
  planStatus?: StoryboardPlanGenerationStatus;
  illustrationStatus?: StoryboardIllustrationLifecycleStatus;
  hasMusic?: boolean;
  planStart?: () => Promise<string | null>;
  illustrationStart?: () => Promise<void>;
  nodes?: Node[];
} = {}) {
  const planStart = opts.planStart ?? vi.fn().mockResolvedValue(null);
  const illustrationStart = opts.illustrationStart ?? vi.fn().mockResolvedValue(undefined);
  const props = {
    activeTab: 'storyboard' as const,
    setActiveTab: vi.fn(),
    draftId: 'draft-1',
    draftOwnerId: opts.draftOwnerId === undefined ? OWNER_ID : opts.draftOwnerId,
    hasMusic: opts.hasMusic ?? false,
    selectedBlockId: null,
    onAddTemplate: vi.fn(),
    isLoading: false,
    error: null,
    nodes: opts.nodes ?? [sceneNode()],
    edges: [],
    nodeTypes: {},
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onConnect: vi.fn(),
    isValidConnection: () => true,
    onNodeDragStart: vi.fn(),
    onNodeDrag: vi.fn(),
    onNodeDragStop: vi.fn(),
    onAddBlock: vi.fn(),
    onAddMusicBlock: vi.fn(),
    canAddMusicBlock: true,
    onNodeClick: vi.fn(),
    isKnifeActive: false,
    onCutEdge: vi.fn(),
    isHistoryOpen: false,
    onCloseHistory: vi.fn(),
    onRestore: vi.fn(),
    planGeneration: planGen(opts.planStatus ?? 'completed', planStart),
    illustrationGeneration: illusGen(opts.illustrationStatus ?? 'completed', illustrationStart),
    isPlanBlocking: false,
  };
  const user = opts.user === undefined ? { userId: OWNER_ID, email: 'o@example.test', displayName: 'O' } : opts.user;
  const utils = render(
    <AuthContext.Provider value={authValue(user)}>
      <StoryboardPageWorkspace {...(props as React.ComponentProps<typeof StoryboardPageWorkspace>)} />
    </AuthContext.Provider>,
  );
  return { ...utils, planStart, illustrationStart };
}

describe('StoryboardPageWorkspace — status menu wiring (T6 integration)', () => {
  it('shows the kebab menus on completed blocks for the owner (AC-09)', () => {
    renderWorkspace();
    expect(screen.getAllByTestId('storyboard-status-menu-trigger')).toHaveLength(2);
  });

  it('renders no kebab menu for a non-owner viewer (AC-09)', () => {
    renderWorkspace({ user: { userId: 'someone-else', email: 'x@example.test', displayName: 'X' } });
    expect(screen.queryByTestId('storyboard-status-menu-trigger')).toBeNull();
  });

  it('gates the destructive scene Regenerate behind the confirm modal and starts exactly one generation on confirm (AC-01, AC-07)', () => {
    const { planStart } = renderWorkspace({ illustrationStatus: 'idle', hasMusic: false });
    // The plan (scenes) block is the first completed block.
    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[0]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));

    // Modal appears; nothing started yet.
    expect(screen.getByTestId('storyboard-regenerate-modal')).toBeTruthy();
    expect(planStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('storyboard-regenerate-confirm-button'));
    expect(planStart).toHaveBeenCalledTimes(1);
    // Modal closed — no second confirm path remains (AC-07 structural guard).
    expect(screen.queryByTestId('storyboard-regenerate-modal')).toBeNull();
  });

  it('cancelling the scene warning starts no generation (AC-05)', () => {
    const { planStart } = renderWorkspace();
    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[0]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));
    fireEvent.click(screen.getByTestId('storyboard-regenerate-cancel-button'));
    expect(planStart).not.toHaveBeenCalled();
    expect(screen.queryByTestId('storyboard-regenerate-modal')).toBeNull();
  });

  it('enumerates only the present losses in the confirm modal (AC-08)', () => {
    // Scenes present (node), music present, illustrations NOT ready.
    renderWorkspace({ illustrationStatus: 'idle', hasMusic: true });
    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[0]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));
    expect(screen.getByTestId('storyboard-regenerate-loss-scenes')).toBeTruthy();
    expect(screen.getByTestId('storyboard-regenerate-loss-music')).toBeTruthy();
    expect(screen.queryByTestId('storyboard-regenerate-loss-illustrations')).toBeNull();
  });

  it('runs the additive illustration Regenerate directly with no confirm modal (AC-03)', () => {
    const { illustrationStart } = renderWorkspace();
    // The illustration block is the second completed block.
    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[1]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));
    expect(illustrationStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storyboard-regenerate-modal')).toBeNull();
  });

  it('hides a single block and leaves the sibling visible (AC-02)', () => {
    renderWorkspace();
    expect(screen.getByTestId('storyboard-plan-controls')).toBeTruthy();
    expect(screen.getByTestId('storyboard-illustration-controls')).toBeTruthy();

    // Hide the plan (scenes) block.
    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[0]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-hide'));

    expect(screen.queryByTestId('storyboard-plan-controls')).toBeNull();
    expect(screen.getByTestId('storyboard-illustration-controls')).toBeTruthy();
  });

  it('reflows the sibling up into the freed top slot when the plan block is hidden (AC-02)', () => {
    renderWorkspace();
    const illustration = screen.getByTestId('storyboard-illustration-controls');
    // While both are shown, the illustration block sits in the lower slot.
    expect(illustration.style.top).toBe('78px');

    fireEvent.click(screen.getAllByTestId('storyboard-status-menu-trigger')[0]);
    fireEvent.click(screen.getByTestId('storyboard-status-menu-hide'));

    // With the plan block gone, the illustration block reflows up to the top slot.
    expect(screen.getByTestId('storyboard-illustration-controls').style.top).toBe('16px');
  });
});
