import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockNavigate,
  mockUseStoryboardCanvas,
  mockUseStoryboardPlanGeneration,
  mockStart,
  mockRetry,
  mockSetNodes,
  mockSetEdges,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseStoryboardCanvas: vi.fn(),
  mockUseStoryboardPlanGeneration: vi.fn(),
  mockStart: vi.fn(),
  mockRetry: vi.fn(),
  mockSetNodes: vi.fn(),
  mockSetEdges: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep} />
  ),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, nodes }: { children?: React.ReactNode; nodes?: Array<{ id: string }> }) => (
    <div data-testid="react-flow-mock">
      <span data-testid="flow-node-ids">{nodes?.map((node) => node.id).join(',') ?? ''}</span>
      {children}
    </div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', () => ({
  useStoryboardCanvas: mockUseStoryboardCanvas,
}));

vi.mock('@/features/storyboard/hooks/useStoryboardPlanGeneration', () => ({
  useStoryboardPlanGeneration: mockUseStoryboardPlanGeneration,
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
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

import { StoryboardPage } from './StoryboardPage';

function renderPage(initialEntry = '/storyboard/test-draft-abc') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setCanvasMock() {
  mockUseStoryboardCanvas.mockReturnValue({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    removeNode: vi.fn(),
  });
}

function setPlanMock(overrides: Record<string, unknown> = {}) {
  mockUseStoryboardPlanGeneration.mockReturnValue({
    status: 'idle',
    jobId: null,
    error: null,
    canvasState: null,
    start: mockStart,
    retry: mockRetry,
    reset: vi.fn(),
    ...overrides,
  });
}

describe('StoryboardPage / storyboard plan generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue('job-1');
    mockRetry.mockResolvedValue('job-2');
    setCanvasMock();
    setPlanMock();
  });

  it('starts plan generation from the compact Step 2 control', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('storyboard-plan-generate-button'));
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shows a blocking overlay and disables Step 3 navigation while generation is running', () => {
    setPlanMock({ status: 'running' });
    renderPage();

    expect(screen.getByTestId('storyboard-plan-overlay')).toBeTruthy();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('next-step3-button'));
    expect(mockNavigate).not.toHaveBeenCalledWith('/generate/road-map');
  });

  it('keeps Back and Home available while generation is running', () => {
    setPlanMock({ status: 'queued' });
    renderPage();

    fireEvent.click(screen.getByTestId('back-button'));
    fireEvent.click(screen.getByTestId('home-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=test-draft-abc');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows failure text and retries without blocking the canvas', () => {
    setPlanMock({ status: 'failed', error: 'Could not apply generated storyboard scenes. Try again.' });
    renderPage();

    expect(screen.queryByTestId('storyboard-plan-overlay')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Could not apply');

    fireEvent.click(screen.getByTestId('storyboard-plan-generate-button'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('hydrates local canvas nodes and edges after apply completes', async () => {
    const generatedNodes = [{ id: 'scene-1', type: 'scene-block', position: { x: 340, y: 200 }, data: {} }];
    const generatedEdges = [{ id: 'edge-1', source: 'start', target: 'scene-1' }];
    setPlanMock({
      status: 'completed',
      canvasState: { nodes: generatedNodes, edges: generatedEdges },
    });

    renderPage();

    await waitFor(() => {
      expect(mockSetNodes).toHaveBeenCalledWith(generatedNodes);
      expect(mockSetEdges).toHaveBeenCalledWith(generatedEdges);
    });
  });

  it('auto-starts when Step 2 is opened with the generateScenes flag', () => {
    renderPage('/storyboard/test-draft-abc?generateScenes=1');
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
