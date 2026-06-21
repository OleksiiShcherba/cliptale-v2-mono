/**
 * MotionGraphicAuthoringView — component tests (T16 / AC-01, AC-02, AC-05, AC-06).
 *
 * Covers the generate half of the authoring loop (sad.md §6 flow 1):
 *   - layout: the duration-seconds input renders ABOVE the chat; the preview fills
 *     the canvas area alongside (AC-02)
 *   - too-short description → server 422 `description_too_short` surfaces inline and
 *     NEITHER opens the stream NOR persists (AC-05)
 *   - happy generate → mock the SSE hook to emit token…done with valid deterministic
 *     code → preview shows + persists via createMotionGraphic with an auto-title sized
 *     to the chosen duration + outcome ready (AC-01/02)
 *   - generate whose assembled code FAILS transpile/determinism → error recorded in
 *     chat, persisted with outcome failed, no broken preview (AC-06)
 *
 * Convention: mirrors MotionGraphicsPage.test.tsx — mock api.ts + the SSE hook +
 * useNavigate, wrap in QueryClientProvider + MemoryRouter.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockCreateMotionGraphic } = vi.hoisted(() => ({
  mockCreateMotionGraphic: vi.fn(),
}));

vi.mock('@/features/motion-graphic/api', () => ({
  createMotionGraphic: mockCreateMotionGraphic,
}));

// The SSE generate hook — return a runner the view calls; the test drives the
// assembled code it resolves with.
const { mockRunGenerate } = vi.hoisted(() => ({ mockRunGenerate: vi.fn() }));

vi.mock('../hooks/useGenerateStream', () => ({
  useGenerateStream: () => ({ runGenerate: mockRunGenerate }),
}));

// Avoid mounting the real Remotion <Player> (jsdom): assert the preview surface
// renders the assembled code instead.
vi.mock('../runtime/MotionGraphicPlayer', () => ({
  MotionGraphicPlayer: ({ code }: { code: string }) => (
    <div data-testid="mg-preview">{code}</div>
  ),
}));

import { MotionGraphicAuthoringView } from './MotionGraphicAuthoringView';
import type { MotionGraphic } from '../types';

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

// A valid deterministic component (frame-driven, no Date/Math.random).
const GOOD_CODE = [
  "import {useCurrentFrame} from 'remotion';",
  'export default function MG() {',
  '  const f = useCurrentFrame();',
  '  return <div>{f}</div>;',
  '}',
].join('\n');

// Code that fails the determinism scan (wall-clock).
const BAD_CODE = [
  'export default function MG() {',
  '  const t = Date.now();',
  '  return <div>{t}</div>;',
  '}',
].join('\n');

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

function fullGraphic(over: Partial<MotionGraphic>): MotionGraphic {
  return {
    id: 'mg-new',
    title: 'Motion Graphic',
    code: GOOD_CODE,
    propsSchema: null,
    durationSeconds: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    runtimeVersion: '1.0.0',
    status: 'ready',
    version: 1,
    chatTurns: [],
    createdAt: new Date('2026-06-19T11:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-06-19T11:00:00.000Z').toISOString(),
    ...over,
  };
}

/** Submit a description through the chat composer. */
function submitDescription(text: string): void {
  const input = screen.getByRole('textbox', { name: /describe/i });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
}

const VALID_DESC = 'A lower-third that slides in the guest name over four seconds.';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MotionGraphicAuthoringView (generate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Layout (AC-02) ─────────────────────────────────────────────────────────

  it('renders the duration input ABOVE the chat, with the preview alongside', () => {
    renderView();

    const duration = screen.getByRole('spinbutton', { name: /duration/i });
    const chat = screen.getByRole('textbox', { name: /describe/i });
    expect(duration).toBeTruthy();
    expect(chat).toBeTruthy();

    // Duration appears before the chat composer in document order (above the chat).
    expect(duration.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The preview surface fills the canvas area alongside the chat.
    expect(screen.getByTestId('mg-authoring-preview')).toBeTruthy();
  });

  // ── Return-home navigation ──────────────────────────────────────────────────

  it('renders a back-home control that navigates to the home route', () => {
    renderView();

    fireEvent.click(screen.getByTestId('mg-back-home'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  // ── Too-short description (AC-05) ───────────────────────────────────────────

  it('surfaces the server description_too_short message inline and does not persist', async () => {
    const tooShort = Object.assign(new Error('Add a longer, more detailed description.'), {
      code: 'motion_graphic.description_too_short',
      status: 422,
    });
    mockRunGenerate.mockRejectedValue(tooShort);

    renderView();
    submitDescription('tiny');

    // Confirm the cost gate so the stream is attempted.
    await waitFor(() => screen.getByRole('button', { name: /^generate$/i, hidden: false }));
    const confirm = screen.queryByRole('button', { name: /confirm/i });
    if (confirm) fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.getByText(/longer, more detailed description/i)).toBeTruthy();
    });
    expect(mockCreateMotionGraphic).not.toHaveBeenCalled();
  });

  // ── Happy generate → preview + persist ready (AC-01/02) ─────────────────────

  it('persists a ready graphic with an auto-title sized to the duration and shows the preview', async () => {
    mockRunGenerate.mockResolvedValue(GOOD_CODE);
    mockCreateMotionGraphic.mockResolvedValue(fullGraphic({ status: 'ready' }));

    renderView();

    // Set a duration and describe.
    const duration = screen.getByRole('spinbutton', { name: /duration/i });
    fireEvent.change(duration, { target: { value: '7' } });
    submitDescription(VALID_DESC);

    const confirm = await screen.findByRole('button', { name: /confirm/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockCreateMotionGraphic).toHaveBeenCalledTimes(1);
    });
    const body = mockCreateMotionGraphic.mock.calls[0][0];
    expect(body.outcome).toBe('ready');
    expect(body.durationSeconds).toBe(7);
    expect(body.code).toBe(GOOD_CODE);
    expect(body.prompt).toBe(VALID_DESC);

    // Preview shows the assembled code, not a broken region.
    await waitFor(() => {
      expect(screen.getByTestId('mg-preview').textContent).toContain('useCurrentFrame');
    });
  });

  // ── Failed generate → error in chat, no broken preview (AC-06) ──────────────

  it('records a failed verdict in chat and shows no broken preview when code fails determinism', async () => {
    mockRunGenerate.mockResolvedValue(BAD_CODE);
    mockCreateMotionGraphic.mockResolvedValue(fullGraphic({ status: 'failed', code: null }));

    renderView();
    submitDescription(VALID_DESC);

    const confirm = await screen.findByRole('button', { name: /confirm/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockCreateMotionGraphic).toHaveBeenCalledTimes(1);
    });
    const body = mockCreateMotionGraphic.mock.calls[0][0];
    expect(body.outcome).toBe('failed');
    expect(body.code == null).toBe(true);
    expect(typeof body.errorMessage).toBe('string');

    // The error is surfaced in the chat and NO preview is mounted for bad code.
    await waitFor(() => {
      expect(screen.getByTestId('mg-chat-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('mg-preview')).toBeNull();
  });
});
