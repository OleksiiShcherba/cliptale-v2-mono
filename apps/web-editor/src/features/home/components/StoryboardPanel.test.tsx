/**
 * StoryboardPanel — tests.
 *
 * Covers: loading / empty / error / populated renders;
 * Create Storyboard button (async createDraft → navigate);
 * card click navigates to /generate?draftId=<id>.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockNavigate, mockCreateDraft } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const { mockUseStoryboardCards } = vi.hoisted(() => ({
  mockUseStoryboardCards: vi.fn(),
}));

vi.mock('@/features/home/hooks/useStoryboardCards', () => ({
  useStoryboardCards: mockUseStoryboardCards,
}));

vi.mock('@/features/generate-wizard/api', () => ({
  createDraft: mockCreateDraft,
}));

import { StoryboardPanel } from './StoryboardPanel';
import type { StoryboardCardSummary } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel(client?: QueryClient) {
  const qc = client ?? makeClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StoryboardPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CARDS: StoryboardCardSummary[] = [
  {
    draftId: 'draft-1',
    status: 'draft',
    textPreview: 'First storyboard text',
    mediaPreviews: [],
    updatedAt: new Date().toISOString(),
  },
  {
    draftId: 'draft-2',
    status: 'step2',
    textPreview: 'Second storyboard text',
    mediaPreviews: [
      { fileId: 'asset-1', type: 'video', thumbnailUrl: 'https://example.com/thumb1.jpg' },
    ],
    updatedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('should render 3 skeleton placeholders while loading', () => {
    mockUseStoryboardCards.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPanel();
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBe(3);
  });

  it('should render the Create Storyboard button in the header while loading', () => {
    mockUseStoryboardCards.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPanel();
    expect(screen.getByRole('button', { name: /create storyboard/i })).toBeDefined();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('should render error alert when isError is true', () => {
    mockUseStoryboardCards.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPanel();
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('Could not load storyboards');
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('should render empty state copy and centered Create CTA when no cards', () => {
    mockUseStoryboardCards.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByText('No storyboards yet')).toBeDefined();
    expect(screen.getByRole('button', { name: /create storyboard/i })).toBeDefined();
  });

  // ── Populated state ────────────────────────────────────────────────────────

  it('should render a card for each storyboard when populated', () => {
    mockUseStoryboardCards.mockReturnValue({ data: CARDS, isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByText('First storyboard text')).toBeDefined();
    expect(screen.getByText('Second storyboard text')).toBeDefined();
  });

  it('should render the header Create CTA when populated', () => {
    mockUseStoryboardCards.mockReturnValue({ data: CARDS, isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByRole('button', { name: /create storyboard/i })).toBeDefined();
  });

  // ── Create navigation — async createDraft flow ────────────────────────────

  it('should call createDraft with blank prompt doc and navigate with draftId on success', async () => {
    mockUseStoryboardCards.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockCreateDraft.mockResolvedValue({ id: 'new-draft-1', status: 'draft' } as any);

    renderPanel();
    const btn = screen.getByRole('button', { name: /create storyboard/i });
    fireEvent.click(btn);

    // Wait for async createDraft to settle and navigate
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith({ schemaVersion: 1, blocks: [] });
      expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=new-draft-1');
    });
  });

  it('should navigate to /generate as fallback when createDraft fails', async () => {
    mockUseStoryboardCards.mockReturnValue({ data: CARDS, isLoading: false, isError: false });
    mockCreateDraft.mockRejectedValue(new Error('Network error'));

    renderPanel();
    const btn = screen.getByRole('button', { name: /create storyboard/i });
    fireEvent.click(btn);

    // Wait for async createDraft to reject and fallback navigate
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/generate');
    });
  });

  it('should disable Create button and show "Creating..." text while draft is being created', async () => {
    mockUseStoryboardCards.mockReturnValue({ data: [], isLoading: false, isError: false });
    // Hang the promise so we can check the in-flight state
    mockCreateDraft.mockReturnValue(new Promise(() => {}));

    renderPanel();
    const btn = screen.getByRole('button', { name: /create storyboard/i }) as HTMLButtonElement;
    fireEvent.click(btn);

    // In-flight: button should be disabled and show "Creating…"
    await waitFor(() => {
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('Creating…');
    });
  });

  it('should not allow double-click while createDraft is in-flight', async () => {
    mockUseStoryboardCards.mockReturnValue({ data: [], isLoading: false, isError: false });
    // Hang the promise to keep isCreating=true
    mockCreateDraft.mockReturnValue(new Promise(() => {}));

    renderPanel();
    const btn = screen.getByRole('button', { name: /create storyboard/i });
    fireEvent.click(btn);
    fireEvent.click(btn); // Double-click
    fireEvent.click(btn); // Triple-click

    // Only one createDraft call should be made
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    });
  });

  // ── Card-click navigation ──────────────────────────────────────────────────

  it('should navigate with draftId query param when a card is clicked', () => {
    mockUseStoryboardCards.mockReturnValue({ data: CARDS, isLoading: false, isError: false });
    renderPanel();
    // The outer card div has aria-label starting with "Resume storyboard: "
    const cards = screen.getAllByRole('button', { name: /^resume storyboard:/i });
    // First card corresponds to draft-1
    fireEvent.click(cards[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=draft-1');
  });

  it('should navigate with correct draftId when Resume button is clicked', () => {
    mockUseStoryboardCards.mockReturnValue({ data: CARDS, isLoading: false, isError: false });
    renderPanel();
    const resumeBtns = screen.getAllByRole('button', { name: /resume storyboard draft/i });
    fireEvent.click(resumeBtns[1]);
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=draft-2');
  });
});
