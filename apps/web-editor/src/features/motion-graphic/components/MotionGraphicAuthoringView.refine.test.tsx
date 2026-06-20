/**
 * MotionGraphicAuthoringView — refine + hydration tests (T17 / AC-03, AC-14).
 *
 * Covers the iterate half of the authoring loop (sad.md §6 flow 3) on the
 * `/motion-graphics/:id` route:
 *   - HYDRATE: the :id route loads an existing graphic via getMotionGraphic and
 *     shows its chat history + current ready preview (Flow 4, US-05).
 *   - REFINE ready (AC-03): sending a refinement shows cost + confirm, opens the
 *     refine SSE stream, runs transpile+determinism, and on a clean verdict calls
 *     appendMotionGraphicTurn with outcome `ready` + the new code; the preview
 *     refreshes to the NEW code.
 *   - REFINE failed (AC-14): a refinement whose assembled code fails determinism
 *     records the error in chat, calls appendMotionGraphicTurn with outcome
 *     `failed`, and KEEPS the last working preview unchanged (the preview must
 *     still show the previous working code, NOT the failed code).
 *
 * Convention: mirrors MotionGraphicAuthoringView.test.tsx — mock api.ts + the SSE
 * hook + useParams, wrap in QueryClientProvider + MemoryRouter.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseParams } = vi.hoisted(() => ({ mockUseParams: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => mockUseParams() };
});

const { mockGetMotionGraphic, mockAppendMotionGraphicTurn, mockCreateMotionGraphic } = vi.hoisted(
  () => ({
    mockGetMotionGraphic: vi.fn(),
    mockAppendMotionGraphicTurn: vi.fn(),
    mockCreateMotionGraphic: vi.fn(),
  }),
);

vi.mock('@/features/motion-graphic/api', () => ({
  getMotionGraphic: mockGetMotionGraphic,
  appendMotionGraphicTurn: mockAppendMotionGraphicTurn,
  createMotionGraphic: mockCreateMotionGraphic,
}));

// The SSE hooks — both generate + refine runners come from the same hook.
const { mockRunGenerate, mockRunRefine } = vi.hoisted(() => ({
  mockRunGenerate: vi.fn(),
  mockRunRefine: vi.fn(),
}));

vi.mock('../hooks/useGenerateStream', () => ({
  useGenerateStream: () => ({ runGenerate: mockRunGenerate, runRefine: mockRunRefine }),
}));

vi.mock('../runtime/MotionGraphicPlayer', () => ({
  MotionGraphicPlayer: ({ code }: { code: string }) => (
    <div data-testid="mg-preview">{code}</div>
  ),
}));

import { MotionGraphicAuthoringView } from './MotionGraphicAuthoringView';
import type { MotionGraphic, ChatTurn } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKING_CODE = [
  "import {useCurrentFrame} from 'remotion';",
  'export default function MG() {',
  '  const f = useCurrentFrame();',
  '  return <div>working {f}</div>;',
  '}',
].join('\n');

const NEW_GOOD_CODE = [
  "import {useCurrentFrame} from 'remotion';",
  'export default function MG() {',
  '  const f = useCurrentFrame();',
  '  return <div>refined {f}</div>;',
  '}',
].join('\n');

// Fails determinism (wall-clock).
const BAD_CODE = [
  'export default function MG() {',
  '  const t = Date.now();',
  '  return <div>{t}</div>;',
  '}',
].join('\n');

function turn(over: Partial<ChatTurn>): ChatTurn {
  return {
    id: 'turn-1',
    role: 'user',
    seq: 1,
    content: 'first instruction',
    generatedCode: null,
    outcome: null,
    errorMessage: null,
    createdAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
    ...over,
  };
}

function existingGraphic(over: Partial<MotionGraphic> = {}): MotionGraphic {
  return {
    id: 'mg-1',
    title: 'My Lower Third',
    code: WORKING_CODE,
    propsSchema: null,
    durationSeconds: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    runtimeVersion: '1.0.0',
    status: 'ready',
    version: 3,
    chatTurns: [
      turn({ id: 't1', role: 'user', seq: 1, content: 'make a lower third' }),
      turn({
        id: 't2',
        role: 'assistant',
        seq: 2,
        content: 'Lower third ready',
        generatedCode: WORKING_CODE,
        outcome: 'ready',
      }),
    ],
    createdAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-06-19T10:30:00.000Z').toISOString(),
    ...over,
  };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderView() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>
        <MotionGraphicAuthoringView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitRefine(text: string): void {
  const input = screen.getByRole('textbox', { name: /describe/i });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
}

const INSTRUCTION = 'Make the name slide in from the left instead.';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MotionGraphicAuthoringView (refine + hydration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'mg-1' });
  });

  // ── Hydration (Flow 4 / US-05) ─────────────────────────────────────────────

  it('hydrates the :id route — loads the graphic and shows its chat + current preview', async () => {
    mockGetMotionGraphic.mockResolvedValue(existingGraphic());

    renderView();

    await waitFor(() => {
      expect(mockGetMotionGraphic).toHaveBeenCalledWith('mg-1');
    });

    // Existing chat history is shown.
    await waitFor(() => {
      expect(screen.getByText(/make a lower third/i)).toBeTruthy();
    });
    // The current ready code fills the preview.
    expect(screen.getByTestId('mg-preview').textContent).toContain('working');
  });

  // ── Refine ready (AC-03) ───────────────────────────────────────────────────

  it('persists a ready refinement via appendMotionGraphicTurn and refreshes the preview', async () => {
    mockGetMotionGraphic.mockResolvedValue(existingGraphic());
    mockRunRefine.mockResolvedValue(NEW_GOOD_CODE);
    mockAppendMotionGraphicTurn.mockResolvedValue(
      existingGraphic({ code: NEW_GOOD_CODE, version: 4 }),
    );

    renderView();
    await waitFor(() => expect(mockGetMotionGraphic).toHaveBeenCalled());

    submitRefine(INSTRUCTION);
    const confirm = await screen.findByRole('button', { name: /confirm/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockAppendMotionGraphicTurn).toHaveBeenCalledTimes(1);
    });
    const [id, body] = mockAppendMotionGraphicTurn.mock.calls[0];
    expect(id).toBe('mg-1');
    expect(body.outcome).toBe('ready');
    expect(body.code).toBe(NEW_GOOD_CODE);
    expect(body.instruction).toBe(INSTRUCTION);

    // The refine stream (not the generate stream) was used.
    expect(mockRunRefine).toHaveBeenCalledTimes(1);
    expect(mockRunGenerate).not.toHaveBeenCalled();

    // Preview refreshes to the NEW code.
    await waitFor(() => {
      expect(screen.getByTestId('mg-preview').textContent).toContain('refined');
    });
  });

  // ── Refine failed → keep last working (AC-14, the crux) ─────────────────────

  it('records a failed refinement and KEEPS the last working preview unchanged', async () => {
    mockGetMotionGraphic.mockResolvedValue(existingGraphic());
    mockRunRefine.mockResolvedValue(BAD_CODE);
    // Server keeps last working; the returned graphic still carries WORKING_CODE.
    mockAppendMotionGraphicTurn.mockResolvedValue(existingGraphic());

    renderView();
    await waitFor(() => expect(mockGetMotionGraphic).toHaveBeenCalled());
    // Preconditions: the working preview is mounted.
    await waitFor(() => {
      expect(screen.getByTestId('mg-preview').textContent).toContain('working');
    });

    submitRefine(INSTRUCTION);
    const confirm = await screen.findByRole('button', { name: /confirm/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockAppendMotionGraphicTurn).toHaveBeenCalledTimes(1);
    });
    const [id, body] = mockAppendMotionGraphicTurn.mock.calls[0];
    expect(id).toBe('mg-1');
    expect(body.outcome).toBe('failed');
    expect(body.code == null).toBe(true);
    expect(typeof body.errorMessage).toBe('string');

    // The error is recorded in chat.
    await waitFor(() => {
      expect(screen.getByTestId('mg-chat-error')).toBeTruthy();
    });

    // AC-14: the preview STILL shows the LAST WORKING code — never the bad code.
    const preview = screen.getByTestId('mg-preview');
    expect(preview.textContent).toContain('working');
    expect(preview.textContent).not.toContain('Date.now');
  });
});
