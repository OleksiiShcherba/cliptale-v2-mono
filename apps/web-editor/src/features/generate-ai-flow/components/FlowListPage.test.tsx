/**
 * FlowListPage — component tests.
 *
 * TDD cycle (T16 / AC-04):
 *   - list renders most-recent first
 *   - create / rename / delete / open actions call the flow api correctly
 *
 * Convention: match ProjectsPanel.test.tsx pattern — mock api.ts + useNavigate,
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
  mockListFlows,
  mockCreateFlow,
  mockRenameFlow,
  mockDeleteFlow,
} = vi.hoisted(() => ({
  mockListFlows: vi.fn(),
  mockCreateFlow: vi.fn(),
  mockRenameFlow: vi.fn(),
  mockDeleteFlow: vi.fn(),
}));

vi.mock('@/features/generate-ai-flow/api', () => ({
  listFlows: mockListFlows,
  createFlow: mockCreateFlow,
  renameFlow: mockRenameFlow,
  deleteFlow: mockDeleteFlow,
}));

import { FlowListPage } from './FlowListPage';
import type { FlowSummary } from '../types';

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
        <FlowListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOW = new Date('2026-06-03T10:00:00.000Z');
const EARLIER = new Date('2026-06-03T09:00:00.000Z');

// Newest first (most recent updatedAt first)
const FLOWS: FlowSummary[] = [
  {
    flowId: 'flow-1',
    title: 'Newest Flow',
    version: 3,
    createdAt: EARLIER.toISOString(),
    updatedAt: NOW.toISOString(),
  },
  {
    flowId: 'flow-2',
    title: 'Older Flow',
    version: 1,
    createdAt: EARLIER.toISOString(),
    updatedAt: EARLIER.toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('renders a loading indicator while fetching', async () => {
    mockListFlows.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    // React Query will be in loading state — page shows spinner/placeholder
    expect(screen.getByRole('status')).toBeDefined();
  });

  // ── List render (newest-first) ─────────────────────────────────────────────

  it('renders flows most-recent first', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Newest Flow')).toBeDefined();
      expect(screen.getByText('Older Flow')).toBeDefined();
    });

    // Verify DOM order: Newest Flow appears before Older Flow
    const titles = screen.getAllByRole('heading', { level: 3 });
    expect(titles[0].textContent).toBe('Newest Flow');
    expect(titles[1].textContent).toBe('Older Flow');
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('renders an empty-state message when there are no flows', async () => {
    mockListFlows.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no flows yet/i)).toBeDefined();
    });
  });

  // ── Create action ──────────────────────────────────────────────────────────

  it('calls createFlow when the Create button is clicked', async () => {
    mockListFlows.mockResolvedValue({ items: [], nextCursor: null });
    mockCreateFlow.mockResolvedValue({
      flowId: 'new-flow-id',
      title: 'Untitled flow',
      version: 1,
      canvas: { blocks: [], edges: [] },
      jobs: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /create.*flow/i }));

    fireEvent.click(screen.getByRole('button', { name: /create.*flow/i }));

    await waitFor(() => {
      expect(mockCreateFlow).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates to /generate-ai/<flowId> after successful create', async () => {
    mockListFlows.mockResolvedValue({ items: [], nextCursor: null });
    mockCreateFlow.mockResolvedValue({
      flowId: 'new-flow-id',
      title: 'Untitled flow',
      version: 1,
      canvas: { blocks: [], edges: [] },
      jobs: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /create.*flow/i }));

    fireEvent.click(screen.getByRole('button', { name: /create.*flow/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/generate-ai/new-flow-id');
    });
  });

  // ── Open action (U4 — whole card is clickable; no separate Open button) ──

  it('navigates to /generate-ai/<flowId> when the card itself is clicked', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    fireEvent.click(screen.getByRole('button', { name: /open flow newest flow/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/generate-ai/flow-1');
  });

  it('renders no separate Open button', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    expect(screen.queryByText('Open')).toBeNull();
  });

  it('navigates when Enter is pressed on the focused card', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    const card = screen.getByRole('button', { name: /open flow newest flow/i });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/generate-ai/flow-1');
  });

  it('highlights the card border on hover', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    const card = screen.getByRole('button', { name: /open flow newest flow/i });
    expect(card.style.borderColor).toBe('rgb(37, 37, 53)'); // BORDER #252535

    fireEvent.mouseEnter(card);
    expect(card.style.borderColor).toBe('rgb(124, 58, 237)'); // PRIMARY #7C3AED

    fireEvent.mouseLeave(card);
    expect(card.style.borderColor).toBe('rgb(37, 37, 53)');
  });

  it('does not navigate when Rename or Delete inside the card is clicked', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    mockDeleteFlow.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    fireEvent.click(screen.getByRole('button', { name: /rename.*newest flow/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete.*older flow/i }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate on card click while renaming is in progress', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Newest Flow'));

    fireEvent.click(screen.getByRole('button', { name: /rename.*newest flow/i }));
    const input = screen.getByRole('textbox', { name: /flow title/i });
    fireEvent.click(input); // a click inside the rename input must not navigate

    fireEvent.click(screen.getByRole('button', { name: /open flow newest flow/i }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Rename action ──────────────────────────────────────────────────────────

  it('calls renameFlow with flowId and new title when renamed', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    mockRenameFlow.mockResolvedValue({
      flowId: 'flow-1',
      title: 'Renamed Flow',
      version: 4,
      createdAt: EARLIER.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    renderPage();
    await waitFor(() => screen.getByText('Newest Flow'));

    // Click rename for first flow
    fireEvent.click(screen.getByRole('button', { name: /rename.*newest flow/i }));

    // An inline input should appear; type new title and confirm
    const input = screen.getByRole('textbox', { name: /flow title/i });
    fireEvent.change(input, { target: { value: 'Renamed Flow' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockRenameFlow).toHaveBeenCalledWith('flow-1', 'Renamed Flow');
    });
  });

  // ── Delete action ──────────────────────────────────────────────────────────

  it('calls deleteFlow with flowId when Delete is clicked', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    mockDeleteFlow.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => screen.getByText('Newest Flow'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*newest flow/i }));

    await waitFor(() => {
      expect(mockDeleteFlow).toHaveBeenCalledWith('flow-1');
    });
  });

  it('removes the deleted flow from the list optimistically', async () => {
    mockListFlows.mockResolvedValue({ items: FLOWS, nextCursor: null });
    mockDeleteFlow.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => screen.getByText('Newest Flow'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*newest flow/i }));

    await waitFor(() => {
      expect(screen.queryByText('Newest Flow')).toBeNull();
    });
  });
});
