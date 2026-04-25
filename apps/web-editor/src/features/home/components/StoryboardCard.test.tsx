/**
 * StoryboardCard — tests.
 *
 * Covers: status badge color mapping; media-preview cap at 3;
 * placeholder SVG on null thumbnail; click-to-navigate; Resume button;
 * authenticated thumbnail src (token appended via buildAuthenticatedUrl).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/features/generate-wizard/api', () => ({
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api', () => ({
  restoreStoryboardDraft: vi.fn().mockResolvedValue(undefined),
}));

import { StoryboardCard } from './StoryboardCard';
import type { StoryboardCardSummary } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<StoryboardCardSummary> = {}): StoryboardCardSummary {
  return {
    draftId: 'draft-abc',
    status: 'draft',
    textPreview: 'A story about the future of AI video editing.',
    mediaPreviews: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderCard(card: StoryboardCardSummary) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StoryboardCard card={card} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Status badge color mapping ─────────────────────────────────────────────

  it('should render text-secondary color for draft status', () => {
    renderCard(makeCard({ status: 'draft' }));
    const badge = screen.getByTestId('status-badge');
    expect(badge.getAttribute('data-status')).toBe('draft');
    // TEXT_SECONDARY = #8A8AA0
    expect((badge as HTMLElement).style.color).toBe('rgb(138, 138, 160)');
  });

  it('should render warning color for step2 status', () => {
    renderCard(makeCard({ status: 'step2' }));
    const badge = screen.getByTestId('status-badge');
    expect(badge.getAttribute('data-status')).toBe('step2');
    // WARNING = #F59E0B
    expect((badge as HTMLElement).style.color).toBe('rgb(245, 158, 11)');
  });

  it('should render warning color for step3 status', () => {
    renderCard(makeCard({ status: 'step3' }));
    const badge = screen.getByTestId('status-badge');
    expect(badge.getAttribute('data-status')).toBe('step3');
    // WARNING = #F59E0B
    expect((badge as HTMLElement).style.color).toBe('rgb(245, 158, 11)');
  });

  it('should render success color for completed status', () => {
    renderCard(makeCard({ status: 'completed' }));
    const badge = screen.getByTestId('status-badge');
    expect(badge.getAttribute('data-status')).toBe('completed');
    // SUCCESS = #10B981
    expect((badge as HTMLElement).style.color).toBe('rgb(16, 185, 129)');
  });

  // ── Media preview cap ──────────────────────────────────────────────────────

  it('should render at most 3 media preview thumbs even if more are provided', () => {
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: 'https://example.com/1.jpg' },
        { fileId: 'a2', type: 'video', thumbnailUrl: 'https://example.com/2.jpg' },
        { fileId: 'a3', type: 'video', thumbnailUrl: 'https://example.com/3.jpg' },
        { fileId: 'a4', type: 'image', thumbnailUrl: 'https://example.com/4.jpg' },
      ],
    });
    renderCard(card);
    const imgs = document.querySelectorAll('img[alt^="Preview for"]');
    expect(imgs.length).toBe(3);
  });

  it('should render placeholder SVG when thumbnailUrl is null', () => {
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: null },
      ],
    });
    renderCard(card);
    const placeholder = screen.getByRole('img', { name: 'No preview' });
    expect(placeholder).toBeDefined();
    // Ensure there is no broken <img> with src
    const imgs = document.querySelectorAll('img[src]');
    expect(imgs.length).toBe(0);
  });

  it('should render an img element when thumbnailUrl is provided', () => {
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: 'https://example.com/thumb.jpg' },
      ],
    });
    renderCard(card);
    const img = screen.getByRole('img', { name: /preview for a1/i });
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toBe('https://example.com/thumb.jpg');
  });

  // ── Text preview ────────────────────────────────────────────────────────────

  it('should render the text preview when provided', () => {
    const card = makeCard({ textPreview: 'An epic adventure awaits.' });
    renderCard(card);
    expect(screen.getByText('An epic adventure awaits.')).toBeDefined();
  });

  it('should render "No description" when textPreview is null', () => {
    const card = makeCard({ textPreview: null });
    renderCard(card);
    expect(screen.getByText('No description')).toBeDefined();
  });

  it('should truncate textPreview to 140 chars', () => {
    const long = 'A'.repeat(200);
    const card = makeCard({ textPreview: long });
    renderCard(card);
    // The rendered text should be at most 140 chars
    const el = screen.getByText('A'.repeat(140));
    expect(el).toBeDefined();
  });

  // ── Navigation — status-aware routing (Bug 2 fix) ─────────────────────────

  it('should navigate to /generate?draftId=<id> for draft status when card is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'draft' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=draft-xyz');
  });

  it('should navigate to /storyboard/<id> for step2 status when card is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'step2' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-xyz');
  });

  it('should navigate to /storyboard/<id> for step3 status when card is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'step3' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-xyz');
  });

  it('should navigate to /storyboard/<id> for completed status when card is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'completed' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-xyz');
  });

  it('should navigate to /generate?draftId=<id> for draft status when Resume button is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'draft' }));
    const resumeBtn = screen.getByRole('button', { name: /resume storyboard draft/i });
    fireEvent.click(resumeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=draft-xyz');
  });

  it('should navigate to /storyboard/<id> for step2 status when Resume button is clicked', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'step2' }));
    const resumeBtn = screen.getByRole('button', { name: /resume storyboard draft/i });
    fireEvent.click(resumeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-xyz');
  });

  it('should navigate to /storyboard/<id> for step2 status when Enter key is pressed', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'step2' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/storyboard/draft-xyz');
  });

  it('should navigate to /generate?draftId=<id> for draft status when Space key is pressed', () => {
    renderCard(makeCard({ draftId: 'draft-xyz', status: 'draft' }));
    const card = screen.getByRole('button', { name: /^resume storyboard:/i });
    fireEvent.keyDown(card, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=draft-xyz');
  });

  // ── Auth-aware MediaThumb src ──────────────────────────────────────────────

  it('should render an authenticated thumbnail src in MediaThumb when auth token is set', () => {
    localStorage.setItem('auth_token', 'T');
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: 'https://api.example/assets/abc/thumbnail' },
      ],
    });
    renderCard(card);
    const img = screen.getByRole('img', { name: /preview for a1/i });
    expect((img as HTMLImageElement).src).toContain('?token=T');
  });

  it('should render the raw thumbnail src in MediaThumb when no auth token is set', () => {
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: 'https://api.example/assets/abc/thumbnail' },
      ],
    });
    renderCard(card);
    const img = screen.getByRole('img', { name: /preview for a1/i });
    expect((img as HTMLImageElement).src).toBe('https://api.example/assets/abc/thumbnail');
  });

  it('should still render placeholder SVG in MediaThumb when thumbnailUrl is null (with token set)', () => {
    localStorage.setItem('auth_token', 'T');
    const card = makeCard({
      mediaPreviews: [
        { fileId: 'a1', type: 'video', thumbnailUrl: null },
      ],
    });
    renderCard(card);
    const placeholder = screen.getByRole('img', { name: 'No preview' });
    expect(placeholder).toBeDefined();
    const imgs = document.querySelectorAll('img[src]');
    expect(imgs.length).toBe(0);
  });
});
