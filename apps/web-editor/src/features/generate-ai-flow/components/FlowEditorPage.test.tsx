/**
 * FlowEditorPage — component tests (T22 / AC-01, AC-08b, AC-10, AC-10b).
 *
 * The page assembles the already-built T17–T20 pieces into the routable
 * /generate-ai/:flowId editor screen:
 *   - loads the flow (getFlow → canvas + per-block jobs) and renders FlowCanvas
 *   - exposes an add-block toolbar (content / generation / result)
 *   - shows the Inspector for the selected block
 *   - wires autosave + the Generate spend gate (estimate → CostConfirmModal)
 *
 * Convention: match FlowListPage.test.tsx — mock api.ts, the shared job api and
 * useParams; wrap in QueryClientProvider + MemoryRouter; stub ResizeObserver for
 * @xyflow/react.
 */

import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ flowId: 'flow-1' }) };
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
  // Inspector now renders VoicePickerField for voice_picker fields; the hooks
  // that back it call these two API functions — mock them to avoid network.
  listUserVoices: vi.fn().mockResolvedValue([]),
  listAvailableVoices: vi.fn().mockResolvedValue([]),
  getVoiceSampleUrl: vi.fn().mockResolvedValue('https://example.com/sample.mp3'),
}));

// Realtime subscription is a no-op in the component test.
vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => undefined,
}));

import { FlowEditorPage } from './FlowEditorPage';

const GEN_MODEL = 'fal-ai/nano-banana-2/edit';

function loadedFlow() {
  return {
    flowId: 'flow-1',
    title: 'My flow',
    version: 3,
    canvas: {
      schemaVersion: 1 as const,
      blocks: [
        { blockId: 'c1', type: 'content' as const, position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'hi', modality: 'text' } },
        { blockId: 'g1', type: 'generation' as const, position: { x: 320, y: 0 }, params: { modelId: GEN_MODEL } },
      ],
      edges: [],
    },
    jobs: [],
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/generate-ai/flow-1']}>
        <FlowEditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFlow.mockResolvedValue(loadedFlow());
  mockSaveCanvas.mockResolvedValue({ flowId: 'flow-1', version: 4, updatedAt: '2026-06-03T00:01:00.000Z' });
  mockEstimateGeneration.mockResolvedValue({
    flowId: 'flow-1',
    blockId: 'g1',
    modelId: GEN_MODEL,
    estimate: { currency: 'USD', amount: 0.03 },
    bestEffort: true,
  });
  mockGenerateBlock.mockResolvedValue({ jobId: 'job-1', blockId: 'r1', status: 'queued' });
});

describe('FlowEditorPage', () => {
  it('loads the flow and renders the canvas + add-block toolbar', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());
    expect(mockGetFlow).toHaveBeenCalledWith('flow-1');
    // The add-block toolbar exposes content / generation / result.
    expect(screen.getByRole('button', { name: /add content/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add generation/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add result/i })).toBeDefined();
  });

  it('has a Home link back to the Generate AI tab', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());
    const home = screen.getByRole('link', { name: /home/i });
    expect(home.getAttribute('href')).toBe('/?tab=generate-ai');
  });

  it('restores a produced result image on reload (job is keyed by the generation block)', async () => {
    // On reload there is no live overlay: the result block must resolve its job + preview
    // through its sourceBlockId (the generation block the job is keyed by), or the image is lost.
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 320, y: 0 }, params: { sourceBlockId: 'g1' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-1', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-1', resultUrl: null, errorMessage: null },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/result.png');

    renderPage();

    await waitFor(() => expect(document.querySelector('[data-block-id="r1"]')).not.toBeNull());
    const img = (await screen.findByTestId('result-media-image')) as HTMLImageElement;
    expect(img.src).toContain('result.png');
    expect(mockGetFileUrl).toHaveBeenCalledWith('file-1');
  });

  it("renders the image (not a 100% progress bar) for the REAL DB status 'completed'", async () => {
    // The DB enum is queued|processing|completed|failed (aiGenerationJob.repository.ts,
    // migration 014) and the controller passes it verbatim. A job that finished before
    // the reload therefore arrives as 'completed' — it must show the image, NOT fall
    // through a status mapping into 'queued' and render a stuck 100% progress bar.
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 320, y: 0 }, params: { sourceBlockId: 'g1' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-1', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-1', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T11:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/result.png');

    renderPage();

    await waitFor(() => expect(document.querySelector('[data-block-id="r1"]')).not.toBeNull());
    const img = (await screen.findByTestId('result-media-image')) as HTMLImageElement;
    expect(img.src).toContain('result.png');
    // The bug: 'completed' fell into the default 'queued' branch → a stuck progress bar.
    expect(screen.queryByTestId('result-progress')).toBeNull();
  });

  it('a LEGACY unbound result block shows the LATEST run on reload (pre-U5 fallback)', async () => {
    // A flow saved BEFORE the per-run binding (U5): one unbound result block (no
    // params.jobId) and two runs — an older FAILED attempt and a newer success. The
    // legacy block falls back to the latest run, so it shows the success, not the
    // stale failure. (Post-U5 canvases bind each result block to its own run instead.)
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 320, y: 0 }, params: { sourceBlockId: 'g1' } },
        ],
        edges: [{ edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' }],
      },
      jobs: [
        { jobId: 'job-old', blockId: 'g1', status: 'failed', progress: 0, outputFileId: null, resultUrl: null, errorMessage: 'fal 422 image_urls', createdAt: '2026-06-02T10:00:00.000Z' },
        { jobId: 'job-new', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-1', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T11:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/result.png');

    renderPage();

    await waitFor(() => expect(document.querySelector('[data-block-id="r1"]')).not.toBeNull());
    const img = (await screen.findByTestId('result-media-image')) as HTMLImageElement;
    expect(img.src).toContain('result.png');
    // The stale failed state is NOT shown.
    expect(screen.queryByText(/generation failed/i)).toBeNull();
  });

  it('renders the loaded blocks on the canvas', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());
    expect(document.querySelector('[data-block-id="c1"]')).not.toBeNull();
  });

  it('adds a text content block via the toolbar menu', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());
    const before = document.querySelectorAll('[data-testid="content-node"]').length;
    fireEvent.click(screen.getByRole('button', { name: /add content/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /add text content/i }));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="content-node"]').length).toBe(before + 1),
    );
  });

  // F3 (AC-15 / AC-13): all four content modalities must be assemblable, not just text.
  it('adds image / audio / video content blocks via the content menu (AC-15)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('flow-canvas')).toBeDefined());
    const before = document.querySelectorAll('[data-testid="content-node"]').length;
    for (const modality of ['image', 'audio', 'video']) {
      fireEvent.click(screen.getByRole('button', { name: /add content/i }));
      fireEvent.click(
        await screen.findByRole('menuitem', { name: new RegExp(`add ${modality} content`, 'i') }),
      );
    }
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="content-node"]').length).toBe(before + 3),
    );
  });

  // Review pass 13 (1): a result block ALWAYS appears to the right of its generation
  // block with a small gap — the toolbar path must not cascade it from the top-left.
  it('toolbar Add result places the result block to the RIGHT of its generation block', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /add result/i }));

    await waitFor(() => expect(document.querySelector('[data-testid="result-node"]')).not.toBeNull());
    const wrapper = document
      .querySelector('[data-testid="result-node"]')
      ?.closest('.react-flow__node') as HTMLElement;
    // g1 sits at x=320 — the result lands at g1.x + 320 offset, same y.
    expect(wrapper.style.transform).toMatch(/translate\(640px,\s*0px\)/);
  });

  // F2 (AC-15 / AC-07): the model is pickable in the Inspector and a change persists,
  // so the reconcile path is reachable end-to-end (not dead code).
  it('lets the Creator pick/change a generation block model via the Inspector (AC-15/AC-07)', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const selectModelBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Select model',
    );
    fireEvent.click(selectModelBtn as HTMLElement);

    const modelSelect = (await screen.findByLabelText(/^model$/i)) as HTMLSelectElement;
    expect(modelSelect.value).toBe(GEN_MODEL);

    fireEvent.change(modelSelect, { target: { value: 'elevenlabs/text-to-speech' } });
    await waitFor(() =>
      expect((screen.getByLabelText(/^model$/i) as HTMLSelectElement).value).toBe(
        'elevenlabs/text-to-speech',
      ),
    );
  });

  // F1 (AC-01): Generate must carry the autosave-bumped version, not the stale loaded
  // version — else the first edit makes every Generate 409 silently.
  it('generate sends the autosave-bumped flow version, not the stale loaded one (AC-01)', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    // Edit the canvas → autosave bumps the server version 3 → 4.
    fireEvent.click(screen.getByRole('button', { name: /add generation/i }));
    await waitFor(() => expect(mockSaveCanvas).toHaveBeenCalled(), { timeout: 2500 });
    await waitFor(() =>
      expect(screen.getByTestId('autosave-status').textContent).toContain('v4'),
    );

    // Generate on g1 → confirm.
    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    fireEvent.click(generateBtn as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(mockGenerateBlock).toHaveBeenCalled());
    expect(mockGenerateBlock.mock.calls.at(-1)![2]).toMatchObject({ version: 4 });
  });

  // F4 (AC-03/05/06/17): a blocked Generate must tell the Creator, in plain language,
  // what to fix — the error must reach the screen, not be swallowed.
  it('surfaces a blocked-generation error message in plain language (AC-03/05/06/17)', async () => {
    mockGenerateBlock.mockRejectedValueOnce(
      Object.assign(new Error('Connect a text input to “Prompt” before generating.'), {
        status: 422,
      }),
    );
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    fireEvent.click(generateBtn as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Connect a text input'),
    );
  });

  it('deletes a block via its × delete button (removes it from the canvas)', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const del = genNode.querySelector('button[aria-label="Delete block"]') as HTMLElement;
    expect(del).not.toBeNull();
    fireEvent.click(del);

    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).toBeNull());
    // The content block is untouched.
    expect(document.querySelector('[data-block-id="c1"]')).not.toBeNull();
  });

  it('closes the Inspector when the empty canvas pane is clicked', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    // Open the Inspector by selecting the generation block (its in-node "Select model").
    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const selectModelBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Select model',
    );
    fireEvent.click(selectModelBtn as HTMLElement);
    await waitFor(() => expect(screen.getByTestId('inspector-panel')).toBeDefined());

    // Click the empty pane → selection cleared → Inspector gone.
    fireEvent.click(document.querySelector('.react-flow__pane') as HTMLElement);
    await waitFor(() => expect(screen.queryByTestId('inspector-panel')).toBeNull());
  });

  it('auto-connects the result block to its generation block on Generate (gen→result edge)', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    fireEvent.click(generateBtn as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    // The accepted Generate creates a result block AND a visible gen→result edge,
    // which autosave then persists — assert the edge reached the saved canvas.
    await waitFor(
      () => {
        const lastSave = mockSaveCanvas.mock.calls.at(-1);
        const edges = (lastSave?.[1]?.canvas?.edges ?? []) as Array<{
          sourceBlockId: string;
          targetBlockId: string;
        }>;
        expect(
          edges.some((e) => e.sourceBlockId === 'g1' && e.targetBlockId.startsWith('result-')),
        ).toBe(true);
      },
      { timeout: 2500 },
    );
  });

  // ── U5 (pass-16, AC-01): one generation block accumulates a HISTORY of result
  // blocks — a regeneration appends a new block, it never overwrites the prior one. ──

  it('a second Generate APPENDS a new result block above the prior one — history retained (AC-01)', async () => {
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 320, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 640, y: 0 }, params: { sourceBlockId: 'g1', jobId: 'job-old' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-old', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-old', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T10:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/old.png');

    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    fireEvent.click(generateBtn as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    // A NEW result block appears; the prior one is RETAINED (not reused/overwritten).
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="result-node"]').length).toBe(2),
    );
    expect(document.querySelector('[data-block-id="r1"]')).not.toBeNull();

    // The new block lands right of its gen block (g1.x + 320 = 640) and ABOVE the
    // prior result (r1.y 0 − stack offset 280 = −280) — newest on top.
    const newNode = Array.from(document.querySelectorAll('[data-testid="result-node"]')).find(
      (n) => n.getAttribute('data-block-id') !== 'r1',
    ) as HTMLElement;
    const wrapper = newNode.closest('.react-flow__node') as HTMLElement;
    expect(wrapper.style.transform).toMatch(/translate\(640px,\s*-280px\)/);
  });

  it('two same-session regenerations stack at DISTINCT Y positions (−280, −560) — no overlap (AC-01)', async () => {
    // V1 (pass-17): the tracking effect must read the LIVE canvas, not the controller
    // snapshot frozen at mount — else the 2nd in-session append computes the same Y
    // as the 1st and the new block lands on top of it.
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 320, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 640, y: 0 }, params: { sourceBlockId: 'g1', jobId: 'job-old' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-old', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-old', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T10:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/old.png');
    // Two runs in one session → two distinct job ids.
    mockGenerateBlock
      .mockResolvedValueOnce({ jobId: 'job-1', blockId: 'r-new-1', status: 'queued' })
      .mockResolvedValueOnce({ jobId: 'job-2', blockId: 'r-new-2', status: 'queued' });

    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const regenerate = async () => {
      const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
      const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === 'Generate',
      );
      fireEvent.click(generateBtn as HTMLElement);
      const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));
    };

    await regenerate();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="result-node"]').length).toBe(2),
    );

    await regenerate();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="result-node"]').length).toBe(3),
    );

    // r1 keeps (640, 0); the two new blocks stack ABOVE at distinct Y: −280, then −560.
    const transforms = Array.from(document.querySelectorAll('[data-testid="result-node"]')).map(
      (n) =>
        (n.closest('.react-flow__node') as HTMLElement).style.transform.replace(/\s+/g, ''),
    );
    expect(transforms).toContain('translate(640px,0px)');
    expect(transforms).toContain('translate(640px,-280px)');
    expect(transforms).toContain('translate(640px,-560px)');
  });

  it('on reload each result block shows the output of the run that produced it — history is not collapsed (AC-01)', async () => {
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 320, y: 0 }, params: { sourceBlockId: 'g1', jobId: 'job-1' } },
          { blockId: 'r2', type: 'result' as const, position: { x: 320, y: -280 }, params: { sourceBlockId: 'g1', jobId: 'job-2' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
          { edgeId: 'e2', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r2', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-1', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-1', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T10:00:00.000Z' },
        { jobId: 'job-2', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-2', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T11:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockImplementation((id: string) => Promise.resolve(`https://cdn.test/${id}.png`));

    renderPage();

    await waitFor(() => expect(document.querySelector('[data-block-id="r2"]')).not.toBeNull());

    // r1 shows ITS run's output (job-1 → file-1), r2 shows job-2 → file-2 —
    // NOT both collapsed to the latest run.
    await waitFor(() => {
      const img1 = within(
        document.querySelector('[data-block-id="r1"]') as HTMLElement,
      ).getByTestId('result-media-image') as HTMLImageElement;
      const img2 = within(
        document.querySelector('[data-block-id="r2"]') as HTMLElement,
      ).getByTestId('result-media-image') as HTMLImageElement;
      expect(img1.src).toContain('file-1.png');
      expect(img2.src).toContain('file-2.png');
    });
  });

  it('regenerating with a LEGACY unbound result block freezes it to its previous run (back-compat)', async () => {
    // Flows saved before the per-run binding have result blocks WITHOUT params.jobId.
    // On regenerate, the legacy block must be bound to the PREVIOUS run so it keeps
    // showing its old output, while the new run gets its own fresh block.
    mockGetFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'My flow',
      version: 3,
      canvas: {
        schemaVersion: 1 as const,
        blocks: [
          { blockId: 'g1', type: 'generation' as const, position: { x: 0, y: 0 }, params: { modelId: GEN_MODEL } },
          { blockId: 'r1', type: 'result' as const, position: { x: 320, y: 0 }, params: { sourceBlockId: 'g1' } },
        ],
        edges: [
          { edgeId: 'e1', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
        ],
      },
      jobs: [
        { jobId: 'job-old', blockId: 'g1', status: 'completed', progress: 100, outputFileId: 'file-old', resultUrl: null, errorMessage: null, createdAt: '2026-06-02T10:00:00.000Z' },
      ],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mockGetFileUrl.mockResolvedValue('https://cdn.test/old.png');

    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    fireEvent.click(generateBtn as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: /confirm generation/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid="result-node"]').length).toBe(2),
    );

    // Autosave persists the bindings: the legacy block froze to job-old, the new
    // block carries the fresh run's job id (job-1 from mockGenerateBlock).
    await waitFor(
      () => {
        const lastSave = mockSaveCanvas.mock.calls.at(-1);
        const blocks = (lastSave?.[1]?.canvas?.blocks ?? []) as Array<{
          blockId: string;
          type: string;
          params: Record<string, unknown>;
        }>;
        const legacy = blocks.find((b) => b.blockId === 'r1');
        const fresh = blocks.find((b) => b.type === 'result' && b.blockId !== 'r1');
        expect(legacy?.params.jobId).toBe('job-old');
        expect(fresh?.params.jobId).toBe('job-1');
      },
      { timeout: 2500 },
    );
  });

  it('opens the cost confirm modal when Generate is pressed on a generation block', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-block-id="g1"]')).not.toBeNull());

    // The in-node Generate button (xyflow leaves nodes visibility:hidden until
    // measured in jsdom, so query with { hidden: true }; visible in the E2E browser).
    const genNode = document.querySelector('[data-block-id="g1"]') as HTMLElement;
    const generateBtn = Array.from(genNode.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Generate',
    );
    expect(generateBtn).toBeDefined();
    fireEvent.click(generateBtn as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /confirm generation/i })).toBeDefined(),
    );
    expect(screen.getByTestId('cost-amount').textContent).toContain('USD');
    expect(mockEstimateGeneration).toHaveBeenCalled();
    // No charge until the Creator confirms.
    expect(mockGenerateBlock).not.toHaveBeenCalled();
  });
});
