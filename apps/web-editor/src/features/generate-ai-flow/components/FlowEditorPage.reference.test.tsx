/**
 * FlowEditorPage — T19 / AC-05 component tests (storyboard-reference-flows).
 *
 * AC-05 (spec.md §5): when the Creator opens a reference flow from a storyboard
 * block, the FlowEditorPage shows a visible "back to storyboard" action that
 * returns to that specific draft. When opened normally (not from a block), only
 * the standard "Home" link is shown — no back-to-storyboard.
 *
 * Navigation context is passed via React Router location.state:
 *   { fromDraft: '<draftId>' }
 *
 * Convention: matches FlowEditorPage.test.tsx — mock api.ts, useParams, and
 * useRealtimeSubscription; ResizeObserver stub for @xyflow/react; wrap in
 * QueryClientProvider + MemoryRouter with initialEntries.
 */

import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

beforeAll(() => {
  // @xyflow/react relies on ResizeObserver, absent in jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    // useParams always returns flow-1; useLocation is NOT mocked here so
    // MemoryRouter's initialEntries[0].state propagates correctly.
    useParams: () => ({ flowId: 'flow-1' }),
  };
});

const {
  mockGetFlow,
  mockSaveCanvas,
  mockEstimateGeneration,
  mockGenerateBlock,
  mockGetFileUrl,
} = vi.hoisted(() => ({
  mockGetFlow: vi.fn(),
  mockSaveCanvas: vi.fn(),
  mockEstimateGeneration: vi.fn(),
  mockGenerateBlock: vi.fn(),
  mockGetFileUrl: vi.fn(),
}));

vi.mock('@/features/generate-ai-flow/api', () => ({
  getFlow: mockGetFlow,
  saveCanvas: mockSaveCanvas,
  estimateGeneration: mockEstimateGeneration,
  generateBlock: mockGenerateBlock,
  getFileUrl: mockGetFileUrl,
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getJobStatus: vi.fn().mockResolvedValue({
    jobId: 'job-1',
    status: 'queued',
    progress: 0,
    resultAssetId: null,
    errorMessage: null,
  }),
  listUserVoices: vi.fn().mockResolvedValue([]),
  listAvailableVoices: vi.fn().mockResolvedValue([]),
  getVoiceSampleUrl: vi.fn().mockResolvedValue('https://example.com/sample.mp3'),
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => undefined,
}));

import { FlowEditorPage } from './FlowEditorPage';

const GEN_MODEL = 'fal-ai/nano-banana-2/edit';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';

function loadedFlow() {
  return {
    flowId: 'flow-1',
    title: 'Test Character — reference',
    version: 2,
    canvas: {
      schemaVersion: 1 as const,
      blocks: [
        {
          blockId: 'g1',
          type: 'generation' as const,
          position: { x: 320, y: 0 },
          params: { modelId: GEN_MODEL },
        },
      ],
      edges: [],
    },
    jobs: [],
    createdAt: '2026-06-07T00:00:00.000Z',
    updatedAt: '2026-06-07T00:00:00.000Z',
  };
}

/**
 * Render the editor page with an optional React Router location state.
 * When `fromDraftId` is provided, the state simulates the flow being opened
 * from a storyboard reference block (AC-05).
 */
function renderPage(fromDraftId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const initialEntry = fromDraftId
    ? { pathname: '/generate-ai/flow-1', state: { fromDraft: fromDraftId } }
    : '/generate-ai/flow-1';

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <FlowEditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFlow.mockResolvedValue(loadedFlow());
  mockSaveCanvas.mockResolvedValue({
    flowId: 'flow-1',
    version: 3,
    updatedAt: '2026-06-07T00:01:00.000Z',
  });
  mockEstimateGeneration.mockResolvedValue({
    flowId: 'flow-1',
    blockId: 'g1',
    modelId: GEN_MODEL,
    estimate: { currency: 'USD', amount: 0.03 },
    bestEffort: true,
  });
  mockGenerateBlock.mockResolvedValue({ jobId: 'job-1', blockId: 'r1', status: 'queued' });
  mockGetFileUrl.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests — AC-05
// ---------------------------------------------------------------------------

describe('FlowEditorPage — AC-05: back-to-storyboard action when opened from a block', () => {

  it('AC-05: shows a "back to storyboard" action when opened from a reference block (fromDraft state)', async () => {
    renderPage(DRAFT_ID);

    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());

    // The "back to storyboard" action must be visible when the flow was navigated
    // to from a storyboard reference block.
    const backLink = screen.getByRole('link', { name: /back.*storyboard|storyboard/i });
    expect(backLink).toBeDefined();
  });

  it('AC-05: the "back to storyboard" link points to the correct draft', async () => {
    renderPage(DRAFT_ID);

    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());

    const backLink = screen.getByRole('link', { name: /back.*storyboard|storyboard/i });
    // The href must encode the draftId so the Creator returns to the CORRECT draft.
    const href = backLink.getAttribute('href') ?? '';
    expect(href).toContain(DRAFT_ID);
  });

  it('AC-05: does NOT show a "back to storyboard" link when opened normally (no fromDraft state)', async () => {
    renderPage(); // no fromDraftId

    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());

    // Without the navigation context, no back-to-storyboard action is present.
    expect(screen.queryByRole('link', { name: /back.*storyboard/i })).toBeNull();
    // The standard Home link is still present.
    expect(screen.getByRole('link', { name: /home/i })).toBeDefined();
  });

  it('AC-05: the flow is fully editable (canvas and toolbar present) when opened from a block', async () => {
    renderPage(DRAFT_ID);

    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());

    // The full editor chrome is present — the flow is editable like any generation flow.
    expect(screen.getByRole('button', { name: /add content/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add generation/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add result/i })).toBeDefined();
  });
});
