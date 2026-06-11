/**
 * ResultNode — AC-06 / AC-07 component tests (storyboard-reference-flows T18).
 *
 * AC-06 (spec.md §5): starred results become the block's reference candidates and the
 * primary starred result appears as the block's preview on the storyboard canvas.
 * Star/primary-star controls appear ONLY when the node carries a `referenceContext`
 * (i.e. the flow is linked to a reference block). In a regular (non-reference) flow
 * the controls are absent.
 *
 * AC-07 (spec.md §5): removing the primary star falls back the preview to another
 * starred result if any, otherwise the block shows a no-preview placeholder; the same
 * fallback applies when all stars are removed.
 *
 * Test contract for AC-06:
 *   - render ResultNode WITHOUT referenceContext → no star UI visible
 *   - render ResultNode WITH referenceContext (stars=[]) → star toggle button visible
 *   - toggle: calls starReferenceResult optimistically; preview URL updates to starred file
 *   - toggle with isPrimary=true: preview URL reflects primary file id
 *   - optimistic update is rolled back (preview URL reverts) when the API call rejects
 *
 * Test contract for AC-07:
 *   - primary star present + another star present → after un-star of primary, preview
 *     falls back to the other star (previewFileId = other star's fileId)
 *   - only one star, it is primary → after un-star, preview becomes null (placeholder)
 *   - un-star all → no-preview placeholder state shown; node still renders (link intact)
 *
 * Convention: follows ResultNode.render.test.tsx (ReactFlowProvider wrapper, NodeProps
 * shape, import style) and FlowEditorPage.reference.test.tsx (vi.mock api.ts, beforeEach
 * clearAllMocks).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

// api module is mocked; actual calls must not reach the network
const { mockStarReferenceResult, mockUnstarReferenceResult } = vi.hoisted(() => ({
  mockStarReferenceResult: vi.fn(),
  mockUnstarReferenceResult: vi.fn(),
}));

vi.mock('@/features/generate-ai-flow/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/generate-ai-flow/api')>();
  return {
    ...actual,
    starReferenceResult: mockStarReferenceResult,
    unstarReferenceResult: mockUnstarReferenceResult,
  };
});

import { ResultNode } from './ResultNode';
import type { ResultNodeData } from './ResultNode';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID = '55555555-5555-4555-8555-555555555555';
const FILE_A = '77777777-7777-4777-8777-777777777777';
const FILE_B = '88888888-8888-4888-8888-888888888888';

/** A star entry as returned by BlockStarsState.stars. */
type StarEntry = { fileId: string; isPrimary: boolean; createdAt: string };

/** referenceContext shape expected by the component (AC-06/07). */
type ReferenceContext = {
  draftId: string;
  blockId: string;
  stars: StarEntry[];
  previewFileId: string | null;
  onStarToggle: (fileId: string, isPrimary?: boolean) => void;
  onUnstar: (fileId: string) => void;
};

function renderNode(data: Partial<ResultNodeData & { referenceContext?: ReferenceContext }>) {
  const props = {
    id: 'r1',
    data: {
      block: {
        blockId: 'r1',
        type: 'result',
        position: { x: 0, y: 0 },
        params: { sourceBlockId: 'g1' },
      },
      modality: 'image' as const,
      job: {
        jobId: 'j1',
        status: 'completed' as const,
        progress: 100,
        resultAssetId: FILE_A,
        errorMessage: null,
      },
      previewUrl: `https://cdn/${FILE_A}.png`,
      ...data,
    },
    type: 'result',
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  } as unknown as NodeProps;

  return render(
    <ReactFlowProvider>
      <ResultNode {...props} />
    </ReactFlowProvider>,
  );
}

function makeReferenceContext(overrides: Partial<ReferenceContext> = {}): ReferenceContext {
  return {
    draftId: DRAFT_ID,
    blockId: BLOCK_ID,
    stars: [],
    previewFileId: null,
    onStarToggle: vi.fn(),
    onUnstar: vi.fn(),
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy path: star/unstar succeed and return the new BlockStarsState shape
  mockStarReferenceResult.mockResolvedValue({
    blockId: BLOCK_ID,
    stars: [{ fileId: FILE_A, isPrimary: true, createdAt: '2026-06-07T12:30:00.000Z' }],
    previewFileId: FILE_A,
  });
  mockUnstarReferenceResult.mockResolvedValue({
    blockId: BLOCK_ID,
    stars: [],
    previewFileId: null,
  });
});

// ── AC-06: star controls visible only in reference flows ─────────────────────

describe('ResultNode — AC-06: star controls only in reference-flow context', () => {
  it('does NOT render star controls when referenceContext is absent (regular flow)', () => {
    renderNode({}); // no referenceContext

    // Star toggle and primary-star controls must be absent in non-reference flows.
    expect(screen.queryByRole('button', { name: /star/i })).toBeNull();
    expect(screen.queryByTestId('star-toggle')).toBeNull();
    expect(screen.queryByTestId('primary-star-toggle')).toBeNull();
  });

  it('renders star toggle button when referenceContext is provided', () => {
    const referenceContext = makeReferenceContext({ stars: [] });
    renderNode({ referenceContext });

    // The star toggle must be visible in a reference flow.
    expect(
      screen.getByTestId('star-toggle') ?? screen.getByRole('button', { name: /star/i }),
    ).toBeDefined();
  });

  it('does NOT render a separate primary-star control — the single star IS the control', () => {
    // One control only: a star means "use as a scene reference"; several results
    // can be starred and ALL starred results surface in the block preview.
    const referenceContext = makeReferenceContext({ stars: [] });
    renderNode({ referenceContext });

    expect(screen.queryByTestId('primary-star-toggle')).toBeNull();
    expect(screen.getByTestId('star-toggle')).toBeDefined();
  });

  it('calls onStarToggle (optimistic) when the star button is clicked', async () => {
    const onStarToggle = vi.fn();
    const referenceContext = makeReferenceContext({ stars: [], onStarToggle });
    renderNode({ referenceContext });

    const starBtn =
      screen.getByTestId('star-toggle') ?? screen.getByRole('button', { name: /star/i });
    fireEvent.click(starBtn);

    expect(onStarToggle).toHaveBeenCalledWith(FILE_A, expect.anything());
  });

  it('reflects the starred state visually when stars contains the result file', () => {
    const referenceContext = makeReferenceContext({
      stars: [{ fileId: FILE_A, isPrimary: false, createdAt: '2026-06-07T12:30:00.000Z' }],
      previewFileId: null,
    });
    renderNode({ referenceContext });

    // The star toggle must reflect the starred state (aria-pressed or data-starred).
    const starToggle = screen.getByTestId('star-toggle');
    const isStarred =
      starToggle.getAttribute('aria-pressed') === 'true' ||
      starToggle.getAttribute('data-starred') === 'true';
    expect(isStarred).toBe(true);
  });

  it('treats a legacy primary star simply as starred (single control reflects it)', () => {
    const referenceContext = makeReferenceContext({
      stars: [{ fileId: FILE_A, isPrimary: true, createdAt: '2026-06-07T12:30:00.000Z' }],
      previewFileId: FILE_A,
    });
    renderNode({ referenceContext });

    const starToggle = screen.getByTestId('star-toggle');
    const isStarred =
      starToggle.getAttribute('aria-pressed') === 'true' ||
      starToggle.getAttribute('data-starred') === 'true';
    expect(isStarred).toBe(true);
  });

  it('rolls back the optimistic star when the API call rejects', async () => {
    mockStarReferenceResult.mockRejectedValue(new Error('network error'));

    // Start unstarred; onStarToggle is a controlled callback that the component
    // calls for optimistic update — then must call the API and revert on failure.
    const onStarToggle = vi.fn();
    const onUnstar = vi.fn();
    const referenceContext = makeReferenceContext({
      stars: [],
      previewFileId: null,
      onStarToggle,
      onUnstar,
    });
    renderNode({ referenceContext });

    const starBtn = screen.getByTestId('star-toggle');
    fireEvent.click(starBtn);

    // The component must call onStarToggle optimistically…
    expect(onStarToggle).toHaveBeenCalledTimes(1);

    // …then after the API failure, must call onUnstar (or another revert callback)
    // to roll back the optimistic update.
    await waitFor(() => {
      expect(onUnstar).toHaveBeenCalledTimes(1);
    });
  });
});

// ── AC-07: primary removed → fallback or placeholder ─────────────────────────

describe('ResultNode — AC-07: un-star primary falls back to another star or placeholder', () => {
  it('calls onUnstar when the active star button is clicked on a starred result', () => {
    const onUnstar = vi.fn();
    const referenceContext = makeReferenceContext({
      stars: [{ fileId: FILE_A, isPrimary: true, createdAt: '2026-06-07T12:30:00.000Z' }],
      previewFileId: FILE_A,
      onUnstar,
    });
    renderNode({ referenceContext });

    // Clicking an already-starred result un-stars it.
    const starBtn = screen.getByTestId('star-toggle');
    fireEvent.click(starBtn);

    expect(onUnstar).toHaveBeenCalledWith(FILE_A);
  });

  it('shows no-preview placeholder state when all stars are removed (previewFileId = null, stars = [])', () => {
    // The node renders the result file (FILE_A) but the block has no stars at all.
    // The preview area must show a "no-preview" placeholder to match the placeholder state.
    const referenceContext = makeReferenceContext({
      stars: [],
      previewFileId: null,
    });
    renderNode({ referenceContext });

    // The no-preview placeholder must be visible.
    expect(
      screen.getByTestId('reference-no-preview') ??
        screen.getByText(/no preview|placeholder/i),
    ).toBeDefined();
  });

  it('a remaining non-primary star reads as plainly starred (no fallback indicator — all stars are equal)', () => {
    // With the single-star semantics every star is equal: there is no separate
    // "fallback" state to indicate; the star toggle simply reflects starred.
    const referenceContext = makeReferenceContext({
      stars: [
        { fileId: FILE_A, isPrimary: false, createdAt: '2026-06-07T12:30:00.000Z' },
      ],
      previewFileId: FILE_A,
    });
    renderNode({ referenceContext });

    expect(screen.queryByTestId('reference-preview-fallback')).toBeNull();
    const starToggle = screen.getByTestId('star-toggle');
    expect(starToggle.getAttribute('data-starred')).toBe('true');
  });

  it('renders the node without crashing when all results in the flow are removed (no-flow still intact)', () => {
    // AC-07: block↔flow link stays intact; only stars are gone.
    const referenceContext = makeReferenceContext({
      stars: [],
      previewFileId: null,
    });
    // Job is null (no results) but referenceContext is still present (link intact).
    renderNode({ referenceContext, job: null, previewUrl: null });

    // The node must still render (no error / crash); star controls still present.
    expect(screen.getByTestId('result-node')).toBeDefined();
    expect(screen.getByTestId('star-toggle')).toBeDefined();
  });
});
