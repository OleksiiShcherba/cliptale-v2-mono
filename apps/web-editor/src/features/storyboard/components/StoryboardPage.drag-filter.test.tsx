/** Tests StoryboardPage drag position filtering and controlled mid-drag state. */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { capturedOnNodesChange, mockApplyNodeChanges } = vi.hoisted(() => ({
  capturedOnNodesChange: {
    current: null as ((changes: unknown[]) => void) | null,
  },
  mockApplyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => {
    return (nodes as Array<{ id: string; position?: { x: number; y: number } }>).map((node) => {
      const positionChange = changes.find((change) => {
        return (
          typeof change === 'object' &&
          change !== null &&
          (change as { type?: string; id?: string }).type === 'position' &&
          (change as { id?: string }).id === node.id
        );
      }) as { position?: { x: number; y: number } } | undefined;
      return positionChange?.position
        ? { ...node, position: positionChange.position }
        : node;
    });
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep} />
  ),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: mockApplyNodeChanges,
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
  Handle: ({ type, position, id }: { type: string; position: string; id: string }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
}));

vi.mock('./StoryboardCanvas', () => ({
  StoryboardCanvas: ({
    nodes,
    onNodesChange,
    children,
  }: {
    nodes: Array<{ id: string; position: { x: number; y: number } }>;
    onNodesChange: (changes: unknown[]) => void;
    children?: React.ReactNode;
  }) => {
    capturedOnNodesChange.current = onNodesChange;
    return (
      <div data-testid="storyboard-canvas-mock">
        {nodes.map((node) => (
          <span key={node.id} data-testid={`node-position-${node.id}`}>
            {node.position.x},{node.position.y}
          </span>
        ))}
        {children}
      </div>
    );
  },
}));

vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', () => ({
  useStoryboardCanvas: vi.fn(() => ({
    ...(() => {
      const [nodes, setNodes] = React.useState([
        {
          id: 'node-1',
          type: 'scene-block',
          position: { x: 100, y: 100 },
          data: {},
        },
      ]);
      const [edges, setEdges] = React.useState([]);
      return { nodes, edges, setNodes, setEdges };
    })(),
    isLoading: false,
    error: null,
    removeNode: vi.fn(),
  })),
}));

vi.mock('@/features/storyboard/api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
  initializeStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  fetchStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  persistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
  fetchHistorySnapshots: vi.fn().mockResolvedValue([]),
  addTemplateToStoryboard: vi.fn(),
  fetchStoryboardMusic: vi.fn().mockResolvedValue({ items: [] }),
  updateStoryboardMusicBlock: vi.fn().mockResolvedValue({}),
  generateStoryboardMusicBlock: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock('@/features/storyboard/components/LibraryPanel', () => ({
  LibraryPanel: ({ draftId }: { draftId: string }) => (
    <div data-testid="library-panel-mock" data-draft-id={draftId} />
  ),
}));

vi.mock('@/features/storyboard/components/EffectsPanel', () => ({
  EffectsPanel: ({ selectedBlockId }: { selectedBlockId: string | null }) => (
    <div data-testid="effects-panel-mock" data-selected-block-id={selectedBlockId ?? ''} />
  ),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardPlanGeneration', () => ({
  useStoryboardPlanGeneration: vi.fn(() => ({
    status: 'idle',
    jobId: null,
    error: null,
    canvasState: null,
    start: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  })),
}));

import { StoryboardPage } from './StoryboardPage';

function renderPage(draftId = 'test-draft-drag') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/storyboard/${draftId}`]}>
        <Routes>
          <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoryboardPage / handleNodesChange drag-filter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApplyNodeChanges.mockClear();
    capturedOnNodesChange.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes mid-drag position changes to applyNodeChanges', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const midDragChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 200, y: 200 },
      dragging: true,
    };

    act(() => {
      capturedOnNodesChange.current!([midDragChange]);
    });

    expect(screen.getByTestId('node-position-node-1').textContent).toBe('200,200');
    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    expect(passedChanges).toContainEqual(
      expect.objectContaining({ type: 'position', dragging: true }),
    );
  });

  it('does NOT pass drag-end position changes to applyNodeChanges (SB-POLISH-1c: handled by handleNodeDragStop)', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const dragEndChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 300, y: 300 },
      dragging: false,
    };

    act(() => {
      capturedOnNodesChange.current!([dragEndChange]);
    });

    expect(screen.getByTestId('node-position-node-1').textContent).toBe('100,100');
    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    expect(passedChanges).not.toContainEqual(
      expect.objectContaining({ type: 'position', dragging: false }),
    );
  });

  it('passes non-position changes (select, remove) through unchanged', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const selectChange = { type: 'select', id: 'node-1', selected: true };
    const removeChange = { type: 'remove', id: 'node-1' };

    act(() => {
      capturedOnNodesChange.current!([selectChange, removeChange]);
    });

    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    expect(passedChanges).toContainEqual(expect.objectContaining({ type: 'select' }));
    expect(passedChanges).toContainEqual(expect.objectContaining({ type: 'remove' }));
  });

  it('passes only dragging:true position changes in a mixed position batch', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const midDragChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 150, y: 150 },
      dragging: true,
    };
    const dragEndChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 200, y: 200 },
      dragging: false,
    };

    act(() => {
      capturedOnNodesChange.current!([midDragChange, dragEndChange]);
    });

    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    expect(passedChanges).toContainEqual(
      expect.objectContaining({ dragging: true }),
    );
    expect(passedChanges).not.toContainEqual(
      expect.objectContaining({ type: 'position', dragging: false }),
    );
  });
});
