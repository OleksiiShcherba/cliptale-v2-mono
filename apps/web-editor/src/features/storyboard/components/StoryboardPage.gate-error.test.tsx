/**
 * RED tests — T10 page-level gap.
 *
 * Gap: ReferenceGateMessage and UnlinkedScenesMessage exist as components and their
 * unit tests pass, but NOTHING at page level reads illustrationGeneration.gateError
 * and renders them.  The DoD "a 422 ... lists the named blocking blocks ... visible
 * to the Creator" is unmet.
 *
 * AC-02 (US-02): when a 422 references.reference_gate_failed is returned, the page
 *   renders ReferenceGateMessage with each named blocking block and exposes the
 *   ref-gate-retry-{blockId} / ref-gate-delete-{blockId} controls.
 *
 * AC-04b (US-05): when a 422 references.unlinked_scenes is returned, the page
 *   renders UnlinkedScenesMessage with each named unlinked scene.
 *
 * Intended wire-up (to be implemented in production code):
 *   - StoryboardPage reads illustrationGeneration.gateError (already on the hook
 *     return value; currently not forwarded through useStoryboardGenerationFlow).
 *   - When gateError.code === 'references.reference_gate_failed', StoryboardPage
 *     renders <ReferenceGateMessage blocks={gateError.details.blocks} onRetryBlock=…
 *     onDeleteBlock=…/> in place of (or alongside) the generic illustrationGateError
 *     alert — positioned between StoryboardPageWorkspace and the footer.
 *   - onRetryBlock wires to retryReferenceBlockGeneration(draftId, blockId) (existing API).
 *   - onDeleteBlock wires to removeNode(blockId) (already available in page scope).
 *   - When gateError.code === 'references.unlinked_scenes', StoryboardPage renders
 *     <UnlinkedScenesMessage scenes={gateError.details.scenes} />.
 *   - Both components are mutually exclusive (only one code fires per 422).
 *
 * All tests below are GOOD RED: the components compile and render fine in isolation,
 * but the page never reads gateError so the named blocks/scenes never appear.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── vi.hoisted mocks (must mirror StoryboardPage.plan.test.tsx scaffolding) ────

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
  mockStartStoryboardVideos,
  mockFetchStoryboardMusic,
  mockUpdateStoryboardMusicBlock,
  mockGenerateStoryboardMusicBlock,
  mockListModels,
  mockApiClientGet,
  mockApiClientPost,
  mockRetryReferenceBlockGeneration,
  mockRemoveNode,
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
  mockStartStoryboardVideos: vi.fn(),
  mockFetchStoryboardMusic: vi.fn(),
  mockUpdateStoryboardMusicBlock: vi.fn(),
  mockGenerateStoryboardMusicBlock: vi.fn(),
  mockListModels: vi.fn(),
  mockApiClientGet: vi.fn(),
  mockApiClientPost: vi.fn(),
  mockRetryReferenceBlockGeneration: vi.fn(),
  mockRemoveNode: vi.fn(),
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
      <span data-testid="flow-node-ids">{nodes?.map((n) => n.id).join(',') ?? ''}</span>
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
  startStoryboardVideos: mockStartStoryboardVideos,
  fetchStoryboardMusic: mockFetchStoryboardMusic,
  updateStoryboardMusicBlock: mockUpdateStoryboardMusicBlock,
  generateStoryboardMusicBlock: mockGenerateStoryboardMusicBlock,
  retryReferenceBlockGeneration: mockRetryReferenceBlockGeneration,
  // startStoryboardIllustrations is imported directly by StoryboardPage — keep it
  // as a passthrough; the error path we test is driven by gateError state on the
  // hook mock, not by catching a thrown error from the direct API call.
  startStoryboardIllustrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listModels: mockListModels,
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiClientGet, post: mockApiClientPost, put: vi.fn(), delete: vi.fn() },
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

// ── Render helper ──────────────────────────────────────────────────────────────

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

// ── Canvas / plan / illustration mock setters ─────────────────────────────────

function setCanvasMock(overrides: Record<string, unknown> = {}) {
  mockUseStoryboardCanvas.mockReturnValue({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    removeNode: mockRemoveNode,
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
    gateError: null,
    items: [],
    byBlockId: new Map(),
    isBlocking: false,
    start: mockStartIllustrations,
    retryBlock: mockRetryIllustrationBlock,
    refresh: vi.fn(),
    ...overrides,
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('StoryboardPage / reference gate error display (T10, AC-02 / AC-04b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue('job-1');
    mockRetry.mockResolvedValue('job-2');
    mockStartIllustrations.mockResolvedValue(undefined);
    mockRetryIllustrationBlock.mockResolvedValue(undefined);
    mockRetryReferenceBlockGeneration.mockResolvedValue(undefined);
    mockRemoveNode.mockReturnValue(undefined);
    mockApprovePrincipalImage.mockResolvedValue(undefined);
    mockEditPrincipalImage.mockResolvedValue(undefined);
    mockReplacePrincipalImage.mockResolvedValue(undefined);
    mockSetPrincipalImageReferences.mockResolvedValue(undefined);
    mockStartStoryboardVideos.mockResolvedValue({ items: [] });
    mockFetchStoryboardMusic.mockResolvedValue({ items: [] });
    mockUpdateStoryboardMusicBlock.mockResolvedValue({});
    mockGenerateStoryboardMusicBlock.mockResolvedValue({ items: [] });
    mockListModels.mockResolvedValue({ image_to_video: [] });
    mockApiClientGet.mockImplementation((path: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ url: `https://signed.test${path}` }),
    }));
    mockApiClientPost.mockImplementation((_path: string, body: { fileIds?: string[] }) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        urls: Object.fromEntries((body.fileIds ?? []).map((fileId) => [
          fileId,
          `https://signed.test/files/${fileId}/stream`,
        ])),
        missingFileIds: [],
      }),
    }));
    setCanvasMock();
    setPlanMock();
    setIllustrationMock();
  });

  // ── AC-02: reference_gate_failed ────────────────────────────────────────────

  it('AC-02: renders each named blocking block when gateError.code is reference_gate_failed', () => {
    // illustrationGeneration.gateError carries the structured 422 from the hook.
    // The page must read this field and render ReferenceGateMessage.
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [
            { blockId: 'ref-block-1', name: 'Forest Spirit' },
            { blockId: 'ref-block-2', name: 'Mountain Warrior' },
          ],
        },
      },
    });

    renderPage();

    // The Creator must see each blocking block by name (AC-02: "names each blocking reference block").
    expect(screen.getByText(/Forest Spirit/i)).toBeTruthy();
    expect(screen.getByText(/Mountain Warrior/i)).toBeTruthy();
  });

  it('AC-02: renders the retry testid for each blocking block (existing reference-flow control)', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [
            { blockId: 'ref-block-1', name: 'Forest Spirit' },
            { blockId: 'ref-block-2', name: 'Mountain Warrior' },
          ],
        },
      },
    });

    renderPage();

    // ReferenceGateMessage renders ref-gate-retry-{blockId} for each block.
    // The page must render this component — testids prove it is not the generic string alert.
    expect(screen.getByTestId('ref-gate-retry-ref-block-1')).toBeTruthy();
    expect(screen.getByTestId('ref-gate-retry-ref-block-2')).toBeTruthy();
  });

  it('AC-02: renders the delete testid for each blocking block (existing reference-flow control)', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [
            { blockId: 'ref-block-1', name: 'Forest Spirit' },
          ],
        },
      },
    });

    renderPage();

    expect(screen.getByTestId('ref-gate-delete-ref-block-1')).toBeTruthy();
  });

  it('AC-02: clicking retry on a blocking block triggers the reference retry handler', () => {
    // onRetryBlock must wire to retryReferenceBlockGeneration(draftId, blockId).
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [
            { blockId: 'ref-block-retry', name: 'Forest Spirit' },
          ],
        },
      },
    });

    renderPage();

    fireEvent.click(screen.getByTestId('ref-gate-retry-ref-block-retry'));

    // After wiring, the page should call retryReferenceBlockGeneration with the
    // draft id and the block id.  Assert it was called at all — the exact arguments
    // are validated once the wire-up exists.
    expect(mockRetryReferenceBlockGeneration).toHaveBeenCalledTimes(1);
  });

  it('AC-02: clicking delete on a blocking block triggers the remove-node handler', () => {
    // onDeleteBlock must wire to removeNode(blockId) which is already in page scope.
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [
            { blockId: 'ref-block-del', name: 'Forest Spirit' },
          ],
        },
      },
    });

    renderPage();

    fireEvent.click(screen.getByTestId('ref-gate-delete-ref-block-del'));

    // After wiring, the page passes removeNode as onDeleteBlock.
    expect(mockRemoveNode).toHaveBeenCalledWith('ref-block-del');
  });

  it('AC-02: the reference gate message has role="alert" so screen-readers announce it', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.reference_gate_failed',
        message: 'Reference gate failed',
        details: {
          blocks: [{ blockId: 'ref-block-1', name: 'Forest Spirit' }],
        },
      },
    });

    renderPage();

    // role="alert" is present — ReferenceGateMessage already sets this; the page
    // must actually render the component for the assertion to pass.
    expect(screen.getByRole('alert')).toBeTruthy();
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toMatch(/Forest Spirit/);
  });

  it('AC-02: no gate message is shown when gateError is null (happy path)', () => {
    // No gateError — baseline idle state.  Ensures the test above is not a false pass.
    setIllustrationMock({ gateError: null });

    renderPage();

    // Neither block name appears.
    expect(screen.queryByText(/Forest Spirit/i)).toBeNull();
    // No ref-gate testids present.
    expect(screen.queryByTestId('ref-gate-retry-ref-block-1')).toBeNull();
  });

  // ── AC-04b: unlinked_scenes ─────────────────────────────────────────────────

  it('AC-04b: renders each named unlinked scene when gateError.code is unlinked_scenes', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.unlinked_scenes',
        message: 'Unlinked scenes',
        details: {
          scenes: [
            { blockId: 'scene-1', name: 'Opening Shot' },
            { blockId: 'scene-2', name: 'Climax' },
          ],
        },
      },
    });

    renderPage();

    // The Creator must see each unlinked scene by name (AC-04b: "names the scene(s)").
    expect(screen.getByText(/Opening Shot/i)).toBeTruthy();
    expect(screen.getByText(/Climax/i)).toBeTruthy();
  });

  it('AC-04b: the unlinked scenes message has role="alert" so screen-readers announce it', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.unlinked_scenes',
        message: 'Unlinked scenes',
        details: {
          scenes: [{ blockId: 'scene-1', name: 'Opening Shot' }],
        },
      },
    });

    renderPage();

    expect(screen.getByRole('alert')).toBeTruthy();
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toMatch(/Opening Shot/);
  });

  it('AC-04b: renders a link-a-reference instruction for unlinked scenes', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.unlinked_scenes',
        message: 'Unlinked scenes',
        details: {
          scenes: [{ blockId: 'scene-1', name: 'Opening Shot' }],
        },
      },
    });

    renderPage();

    const alertText = (screen.getByRole('alert').textContent ?? '').toLowerCase();
    // UnlinkedScenesMessage contains "link a reference" — the page must render it.
    expect(alertText).toMatch(/link.*reference|reference.*link/);
  });

  it('AC-04b: no unlinked-scenes message is shown when gateError is null (happy path)', () => {
    setIllustrationMock({ gateError: null });

    renderPage();

    expect(screen.queryByText(/Opening Shot/i)).toBeNull();
  });

  it('AC-04b: handles a null scene name gracefully (openapi: name is string|null)', () => {
    setIllustrationMock({
      gateError: {
        code: 'references.unlinked_scenes',
        message: 'Unlinked scenes',
        details: {
          scenes: [{ blockId: 'scene-null', name: null }],
        },
      },
    });

    renderPage();

    // The page renders UnlinkedScenesMessage which falls back to "Unnamed scene".
    // The alert element must be present and non-empty — no crash.
    const alert = screen.getByRole('alert');
    expect(alert.querySelectorAll('li').length).toBeGreaterThanOrEqual(1);
  });
});
