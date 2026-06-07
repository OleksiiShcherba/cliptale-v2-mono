/**
 * FlowListPage — T19 / AC-12 component tests (storyboard-reference-flows).
 *
 * AC-12 (spec.md §5): auto-created reference flows carry the draft badge in the
 * flow list; attempting to delete such a flow shows a warning that a storyboard
 * block depends on it; only after Creator confirmation does the delete proceed
 * (with `confirm=true`); cancelling leaves the flow and block unchanged.
 *
 * Convention: matches FlowListPage.test.tsx — mock api.ts + useNavigate,
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

const NOW = new Date('2026-06-07T10:00:00.000Z');
const EARLIER = new Date('2026-06-07T09:00:00.000Z');
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';

/** A reference flow that carries a draft badge (AC-12). */
const REFERENCE_FLOW: FlowSummary & { draftBadge: { draftId: string } } = {
  flowId: 'ref-flow-1',
  title: 'Test Character — reference',
  version: 2,
  createdAt: EARLIER.toISOString(),
  updatedAt: NOW.toISOString(),
  draftBadge: { draftId: DRAFT_ID },
};

/** A regular (non-reference) flow without a draft badge. */
const PLAIN_FLOW: FlowSummary = {
  flowId: 'plain-flow-1',
  title: 'Plain Flow',
  version: 1,
  createdAt: EARLIER.toISOString(),
  updatedAt: EARLIER.toISOString(),
};

// ---------------------------------------------------------------------------
// Tests — AC-12
// ---------------------------------------------------------------------------

describe('FlowListPage — AC-12: draft badge and delete warning for reference flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Badge visibility ────────────────────────────────────────────────────────

  it('AC-12: shows a draft badge on a flow that carries draftBadge', async () => {
    mockListFlows.mockResolvedValue({ items: [REFERENCE_FLOW, PLAIN_FLOW], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Test Character — reference')).toBeDefined();
    });

    // The draft badge must be visible on the reference flow card.
    // The badge renders as a visible element with text or aria-label containing 'draft'.
    expect(screen.getByTestId('draft-badge-ref-flow-1')).toBeDefined();
  });

  it('AC-12: does NOT show a draft badge on a plain flow without draftBadge', async () => {
    mockListFlows.mockResolvedValue({ items: [PLAIN_FLOW], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Plain Flow')).toBeDefined();
    });

    // No badge on a plain flow.
    expect(screen.queryByTestId('draft-badge-plain-flow-1')).toBeNull();
  });

  // ── Delete warning dialog ───────────────────────────────────────────────────

  it('AC-12: clicking Delete on a reference flow opens a warning dialog before deleting', async () => {
    mockListFlows.mockResolvedValue({ items: [REFERENCE_FLOW], nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Test Character — reference'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*test character/i }));

    // A warning dialog must appear BEFORE the delete API is called.
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/storyboard.*block|block.*depends|block.*storyboard/i);
    expect(mockDeleteFlow).not.toHaveBeenCalled();
  });

  it('AC-12: cancelling the warning dialog leaves the flow in the list and does not call deleteFlow', async () => {
    mockListFlows.mockResolvedValue({ items: [REFERENCE_FLOW], nextCursor: null });
    renderPage();

    await waitFor(() => screen.getByText('Test Character — reference'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*test character/i }));
    await screen.findByRole('dialog');

    // Cancel / dismiss the dialog.
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Flow still visible, no API call made.
    await waitFor(() => {
      expect(screen.getByText('Test Character — reference')).toBeDefined();
    });
    expect(mockDeleteFlow).not.toHaveBeenCalled();
  });

  it('AC-12: confirming the warning dialog calls deleteFlow with confirm=true', async () => {
    mockListFlows.mockResolvedValue({ items: [REFERENCE_FLOW], nextCursor: null });
    mockDeleteFlow.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => screen.getByText('Test Character — reference'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*test character/i }));
    await screen.findByRole('dialog');

    // Confirm the deletion.
    fireEvent.click(screen.getByRole('button', { name: /confirm.*delete|delete.*anyway|yes.*delete/i }));

    await waitFor(() => {
      // Must be called with the flowId AND confirm=true (AC-12 contract: ?confirm=true).
      expect(mockDeleteFlow).toHaveBeenCalledWith('ref-flow-1', { confirm: true });
    });
  });

  it('AC-12: a plain flow (no draftBadge) is deleted immediately without a warning dialog', async () => {
    mockListFlows.mockResolvedValue({ items: [PLAIN_FLOW], nextCursor: null });
    mockDeleteFlow.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => screen.getByText('Plain Flow'));

    fireEvent.click(screen.getByRole('button', { name: /delete.*plain flow/i }));

    // No dialog — delete proceeds directly without confirm.
    await waitFor(() => {
      expect(mockDeleteFlow).toHaveBeenCalledWith('plain-flow-1');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
