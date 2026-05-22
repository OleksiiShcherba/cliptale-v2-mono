import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockNavigate,
  mockUseStoryboardCanvas,
  mockUseStoryboardIllustrations,
  mockUseStoryboardPlanGeneration,
  mockStart,
  mockRetry,
  mockStartIllustrations,
  mockRetryIllustrationBlock,
  mockSetNodes,
  mockSetEdges,
  mockApprovePrincipalImage,
  mockEditPrincipalImage,
  mockReplacePrincipalImage,
  mockSetPrincipalImageReferences,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseStoryboardCanvas: vi.fn(),
  mockUseStoryboardIllustrations: vi.fn(),
  mockUseStoryboardPlanGeneration: vi.fn(),
  mockStart: vi.fn(),
  mockRetry: vi.fn(),
  mockStartIllustrations: vi.fn(),
  mockRetryIllustrationBlock: vi.fn(),
  mockSetNodes: vi.fn(),
  mockSetEdges: vi.fn(),
  mockApprovePrincipalImage: vi.fn(),
  mockEditPrincipalImage: vi.fn(),
  mockReplacePrincipalImage: vi.fn(),
  mockSetPrincipalImageReferences: vi.fn(),
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

vi.mock('@/features/storyboard/hooks/useStoryboardIllustrations', () => ({
  useStoryboardIllustrations: mockUseStoryboardIllustrations,
}));

vi.mock('@/features/storyboard/api', () => ({
  approveStoryboardPrincipalImage: mockApprovePrincipalImage,
  editStoryboardPrincipalImage: mockEditPrincipalImage,
  replaceStoryboardPrincipalImage: mockReplacePrincipalImage,
  setStoryboardPrincipalImageReferences: mockSetPrincipalImageReferences,
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  buildAuthenticatedUrl: (url: string) => `${url}?token=test`,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://api.test' },
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

const sentinelNodes = [
  { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'START' } },
  { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: 'END' } },
];

const customStoryboardNodes = [
  sentinelNodes[0],
  { id: 'scene-1', type: 'scene-block', position: { x: 200, y: 0 }, data: { block: { id: 'scene-1' } } },
  sentinelNodes[1],
];

function setCanvasMock(overrides: Record<string, unknown> = {}) {
  mockUseStoryboardCanvas.mockReturnValue({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    removeNode: vi.fn(),
    reload: vi.fn(),
    ...overrides,
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

function setIllustrationMock(overrides: Record<string, unknown> = {}) {
  mockUseStoryboardIllustrations.mockReturnValue({
    status: 'idle',
    phase: 'idle',
    error: null,
    reference: null,
    items: [],
    byBlockId: new Map(),
    isBlocking: false,
    start: mockStartIllustrations,
    retryBlock: mockRetryIllustrationBlock,
    refresh: vi.fn(),
    ...overrides,
  });
}

describe('StoryboardPage / storyboard plan generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue('job-1');
    mockRetry.mockResolvedValue('job-2');
    mockStartIllustrations.mockResolvedValue(undefined);
    mockRetryIllustrationBlock.mockResolvedValue(undefined);
    mockApprovePrincipalImage.mockResolvedValue(undefined);
    mockEditPrincipalImage.mockResolvedValue(undefined);
    mockReplacePrincipalImage.mockResolvedValue(undefined);
    mockSetPrincipalImageReferences.mockResolvedValue(undefined);
    setCanvasMock();
    setPlanMock();
    setIllustrationMock();
  });

  it('auto-starts plan generation for a START and END only storyboard', () => {
    setCanvasMock({ nodes: sentinelNodes });
    renderPage();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('does not auto-start plan generation for an existing custom storyboard', () => {
    setCanvasMock({ nodes: customStoryboardNodes });
    renderPage();

    expect(mockStart).not.toHaveBeenCalled();
    expect(screen.queryByTestId('storyboard-plan-generate-button')).toBeNull();
  });

  it('shows a blocking overlay and disables Step 3 navigation while generation is running', () => {
    setPlanMock({ status: 'running' });
    renderPage();

    expect(screen.getByTestId('storyboard-plan-overlay')).toBeTruthy();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('next-step3-button'));
    expect(mockNavigate).not.toHaveBeenCalledWith('/generate/road-map');
  });

  it('disables Step 3 while scene illustrations are running without blocking Back or Home', () => {
    setIllustrationMock({ status: 'running', phase: 'scene', isBlocking: true });
    renderPage();

    expect(screen.queryByTestId('storyboard-plan-overlay')).toBeNull();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('back-button'));
    fireEvent.click(screen.getByTestId('home-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=test-draft-abc');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows visual style reference progress while reference generation is active', () => {
    setIllustrationMock({
      status: 'running',
      phase: 'reference',
      isBlocking: true,
      reference: {
        status: 'running',
        jobId: 'ref-job-1',
        outputFileId: null,
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
    });

    renderPage();

    expect(screen.getByText('Creating visual style reference')).toBeTruthy();
    expect(screen.getByTestId('storyboard-reference-preview-fallback').textContent).toBe('Wait');
    expect(screen.getByTestId('storyboard-reference-loader')).toBeTruthy();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a queued fallback in the canonical reference preview before the thumbnail is ready', () => {
    setIllustrationMock({
      status: 'queued',
      phase: 'reference',
      isBlocking: true,
      reference: {
        status: 'queued',
        jobId: 'ref-job-1',
        outputFileId: null,
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
    });

    renderPage();

    expect(screen.getByTestId('storyboard-reference-preview')).toBeTruthy();
    expect(screen.getByTestId('storyboard-reference-preview-fallback').textContent).toBe('Wait');
    expect(screen.getByTestId('storyboard-reference-loader')).toBeTruthy();
    expect(screen.queryByTestId('storyboard-reference-preview-image')).toBeNull();
  });

  it('shows the ready canonical reference preview thumbnail', () => {
    setIllustrationMock({
      status: 'running',
      phase: 'scene',
      isBlocking: true,
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
    });

    renderPage();

    const image = screen.getByTestId('storyboard-reference-preview-image') as HTMLImageElement;
    expect(image.alt).toBe('Canonical visual style reference');
    expect(image.src).toContain('http://api.test/assets/ref-file-1/thumbnail?token=test');
  });

  it('falls back gracefully when the canonical reference thumbnail fails', () => {
    setIllustrationMock({
      status: 'running',
      phase: 'scene',
      isBlocking: true,
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'ref-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
    });

    renderPage();

    fireEvent.error(screen.getByTestId('storyboard-reference-preview-image'));
    expect(screen.getByTestId('storyboard-reference-preview-fallback').textContent).toBe('Ref');
  });

  it('allows retry from main illustration control when the style reference failed', () => {
    setIllustrationMock({
      status: 'failed',
      phase: 'reference',
      isBlocking: false,
      error: 'Reference failed',
      reference: {
        status: 'failed',
        jobId: 'ref-job-1',
        outputFileId: null,
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: 'Reference failed',
      },
    });

    renderPage();

    expect(screen.getByText('Visual style reference failed')).toBeTruthy();
    expect(screen.getByTestId('storyboard-reference-preview-fallback').textContent).toBe('Failed');
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('storyboard-illustration-retry-button').textContent).toBe('Retry');
    fireEvent.click(screen.getByTestId('storyboard-illustration-retry-button'));
    expect(mockStartIllustrations).toHaveBeenCalledTimes(1);
  });

  it('keeps scene failure retry scoped to the scene block', () => {
    setIllustrationMock({
      status: 'failed',
      phase: 'scene',
      isBlocking: false,
      error: 'Scene failed',
    });

    renderPage();

    expect(screen.getByText('Illustration failed')).toBeTruthy();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('storyboard-illustration-retry-button')).toBeNull();
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

    fireEvent.click(screen.getByTestId('storyboard-plan-retry-button'));
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

  it('starts scene illustrations after generated scenes are applied', async () => {
    setPlanMock({ status: 'completed', canvasState: { nodes: [], edges: [] } });

    renderPage();

    await waitFor(() => {
      expect(mockStartIllustrations).toHaveBeenCalledTimes(1);
    });
  });

  it('injects illustration status and retry callback into scene node data', async () => {
    const retryBlock = vi.fn();
    setCanvasMock();
    setIllustrationMock({
      byBlockId: new Map([
        ['scene-1', {
          blockId: 'scene-1',
          status: 'failed',
          jobId: 'job-1',
          outputFileId: null,
          errorMessage: 'Provider failed',
        }],
      ]),
      retryBlock,
    });

    renderPage();

    await waitFor(() => {
      expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    });

    const updater = mockSetNodes.mock.calls.find(([arg]) => typeof arg === 'function')?.[0] as
      | ((nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>) => Array<{ id: string; type: string; data: Record<string, unknown> }>)
      | undefined;
    expect(updater).toBeDefined();

    const [updatedNode] = updater!([
      {
        id: 'scene-1',
        type: 'scene-block',
        data: {
          block: { id: 'scene-1' },
          onRemove: vi.fn(),
        },
      },
    ]);

    expect(updatedNode.data.illustration).toMatchObject({
      blockId: 'scene-1',
      status: 'failed',
      errorMessage: 'Provider failed',
    });
    expect(updatedNode.data.onRetryIllustration).toBe(retryBlock);
  });

  it('does not expose happy-path generate controls', () => {
    renderPage();

    expect(screen.queryByTestId('storyboard-plan-generate-button')).toBeNull();
    expect(screen.queryByTestId('storyboard-illustration-generate-button')).toBeNull();
  });

  it('keeps Step 3 disabled until all scene illustrations are completed', () => {
    renderPage();

    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Step 3 after all scene illustrations are completed', () => {
    setIllustrationMock({
      status: 'completed',
      phase: 'completed',
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'principal-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'approved',
        errorMessage: null,
      },
      items: [
        {
          blockId: 'scene-1',
          status: 'ready',
          jobId: 'scene-job-1',
          outputFileId: 'scene-file-1',
          errorMessage: null,
        },
      ],
    });

    renderPage();

    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('next-step3-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/generate/road-map?draftId=test-draft-abc');
  });

  it('opens the principal image approval modal and continues after approval', async () => {
    const refresh = vi.fn().mockResolvedValue([
      {
        blockId: 'scene-1',
        status: 'queued',
        jobId: 'scene-job-1',
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    setIllustrationMock({
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'principal-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
      refresh,
    });

    renderPage();

    expect(screen.getByTestId('principal-image-modal')).toBeTruthy();
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('principal-image-approve-button'));

    await waitFor(() => {
      expect(mockApprovePrincipalImage).toHaveBeenCalledWith('test-draft-abc');
      expect(mockStartIllustrations).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('keeps Step 3 blocked when scene start fails after principal approval', async () => {
    const refresh = vi.fn().mockResolvedValue([]);
    const approvedReference = {
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'principal-file-1',
      sourceReferenceFileIds: [],
      approvalStatus: 'approved',
      errorMessage: null,
    };
    setIllustrationMock({
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'principal-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
      refresh,
    });

    const { rerender } = renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('principal-image-approve-button')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('principal-image-approve-button'));

    await waitFor(() => {
      expect(mockApprovePrincipalImage).toHaveBeenCalledWith('test-draft-abc');
      expect(mockStartIllustrations).toHaveBeenCalledTimes(1);
    });

    setIllustrationMock({
      reference: approvedReference,
      refresh,
    });

    rerender(
      <QueryClientProvider client={new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })}
      >
        <MemoryRouter initialEntries={['/storyboard/test-draft-abc']}>
          <Routes>
            <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('principal-image-modal')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Could not start illustration generation.');
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Step 3 blocked when scene start fails before approved state refreshes', async () => {
    const refresh = vi.fn().mockResolvedValue([]);
    setIllustrationMock({
      reference: {
        status: 'ready',
        jobId: 'ref-job-1',
        outputFileId: 'principal-file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'pending',
        errorMessage: null,
      },
      refresh,
    });

    renderPage();

    fireEvent.click(screen.getByTestId('principal-image-approve-button'));

    await waitFor(() => {
      expect(mockApprovePrincipalImage).toHaveBeenCalledWith('test-draft-abc');
      expect(mockStartIllustrations).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert').textContent).toContain('Could not start illustration generation.');
    });
    expect((screen.getByTestId('next-step3-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not auto-start a START and END storyboard twice across rerenders', () => {
    setCanvasMock({ nodes: sentinelNodes });
    const { rerender } = renderPage('/storyboard/test-draft-abc?generateScenes=1');
    expect(mockStart).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })}
      >
        <MemoryRouter initialEntries={['/storyboard/test-draft-abc?generateScenes=1']}>
          <Routes>
            <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
