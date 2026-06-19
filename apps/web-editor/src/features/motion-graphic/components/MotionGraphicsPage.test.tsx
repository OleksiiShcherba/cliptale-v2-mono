/**
 * MotionGraphicsPage — component tests (T13 / AC-01, AC-12, AC-13).
 *
 * Covers:
 *   - empty list → empty state (AC-13 empty branch)
 *   - a list of 2 graphics → both rendered newest-first with title + duration + status (AC-01 / AC-13)
 *   - rename → calls renameMotionGraphic with the new title and reflects it (AC-01)
 *   - duplicate → calls duplicateMotionGraphic and the new copy appears (AC-12)
 *
 * Convention: mirrors FlowListPage.test.tsx — mock api.ts + useNavigate,
 * wrap in QueryClientProvider + MemoryRouter, use @testing-library/react.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared before any imports that reference them)
// ---------------------------------------------------------------------------

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const {
  mockListMotionGraphics,
  mockRenameMotionGraphic,
  mockDuplicateMotionGraphic,
} = vi.hoisted(() => ({
  mockListMotionGraphics: vi.fn(),
  mockRenameMotionGraphic: vi.fn(),
  mockDuplicateMotionGraphic: vi.fn(),
}));

vi.mock('@/features/motion-graphic/api', () => ({
  listMotionGraphics: mockListMotionGraphics,
  renameMotionGraphic: mockRenameMotionGraphic,
  duplicateMotionGraphic: mockDuplicateMotionGraphic,
}));

import { MotionGraphicsPage } from './MotionGraphicsPage';
import type { MotionGraphic, MotionGraphicSummary } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(client?: QueryClient) {
  const qc = client ?? makeClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MotionGraphicsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOW = new Date('2026-06-19T10:00:00.000Z');
const EARLIER = new Date('2026-06-19T09:00:00.000Z');

// Newest first (most recent createdAt first)
const GRAPHICS: MotionGraphicSummary[] = [
  {
    id: 'mg-1',
    title: 'Newest Graphic',
    durationSeconds: 6,
    status: 'ready',
    version: 2,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  },
  {
    id: 'mg-2',
    title: 'Older Graphic',
    durationSeconds: 3,
    status: 'generating',
    version: 1,
    createdAt: EARLIER.toISOString(),
    updatedAt: EARLIER.toISOString(),
  },
];

function makeFullGraphic(over: Partial<MotionGraphic>): MotionGraphic {
  return {
    id: 'mg-new',
    title: 'Newest Graphic (copy)',
    code: 'export const C = () => null;',
    propsSchema: null,
    durationSeconds: 6,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MotionGraphicsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state (AC-13) ────────────────────────────────────────────────────

  it('renders an empty state when there are no graphics', async () => {
    mockListMotionGraphics.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('motion-graphics-empty')).toBeTruthy();
    });
  });

  // ── List render newest-first with title + duration + status (AC-01 / AC-13) ─

  it('renders graphics newest-first with title, duration and status', async () => {
    mockListMotionGraphics.mockResolvedValue({ items: GRAPHICS, nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Newest Graphic')).toBeTruthy();
      expect(screen.getByText('Older Graphic')).toBeTruthy();
    });

    // newest-first DOM order
    const titles = screen.getAllByRole('heading', { level: 3 });
    expect(titles[0].textContent).toBe('Newest Graphic');
    expect(titles[1].textContent).toBe('Older Graphic');

    // duration + status surfaced
    expect(screen.getByText(/6s/)).toBeTruthy();
    expect(screen.getByText(/ready/i)).toBeTruthy();
    expect(screen.getByText(/generating/i)).toBeTruthy();
  });

  // ── Rename action (AC-01) ──────────────────────────────────────────────────

  it('calls renameMotionGraphic with the new title and reflects it', async () => {
    mockListMotionGraphics.mockResolvedValue({ items: GRAPHICS, nextCursor: null });
    mockRenameMotionGraphic.mockResolvedValue({
      ...GRAPHICS[0],
      title: 'Renamed Graphic',
    });

    renderPage();
    await waitFor(() => screen.getByText('Newest Graphic'));

    fireEvent.click(screen.getByRole('button', { name: /rename.*newest graphic/i }));

    const input = screen.getByRole('textbox', { name: /title/i });
    fireEvent.change(input, { target: { value: 'Renamed Graphic' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockRenameMotionGraphic).toHaveBeenCalledWith('mg-1', { title: 'Renamed Graphic' });
    });

    await waitFor(() => {
      expect(screen.getByText('Renamed Graphic')).toBeTruthy();
    });
  });

  // ── Duplicate action (AC-12) ───────────────────────────────────────────────

  it('calls duplicateMotionGraphic and the new copy appears in the list', async () => {
    mockListMotionGraphics.mockResolvedValue({ items: GRAPHICS, nextCursor: null });
    mockDuplicateMotionGraphic.mockResolvedValue(
      makeFullGraphic({ id: 'mg-copy', title: 'Newest Graphic (copy)' }),
    );

    renderPage();
    await waitFor(() => screen.getByText('Newest Graphic'));

    fireEvent.click(screen.getByRole('button', { name: /duplicate.*newest graphic/i }));

    await waitFor(() => {
      expect(mockDuplicateMotionGraphic).toHaveBeenCalledWith('mg-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Newest Graphic (copy)')).toBeTruthy();
    });
  });
});
