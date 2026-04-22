/**
 * ProjectCard — tests.
 *
 * Covers: thumbnail fallback, relative date display, click-to-navigate,
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

const { mockFormatRelativeDate } = vi.hoisted(() => ({
  mockFormatRelativeDate: vi.fn(),
}));

vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: mockFormatRelativeDate,
}));

vi.mock('../api', () => ({
  deleteProject: vi.fn().mockResolvedValue(undefined),
  restoreProject: vi.fn().mockResolvedValue(undefined),
}));

import { ProjectCard } from './ProjectCard';
import type { ProjectSummary } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_WITH_THUMB: ProjectSummary = {
  projectId: 'proj-abc',
  title: 'My Project',
  updatedAt: '2026-04-17T10:00:00.000Z',
  thumbnailUrl: 'https://example.com/thumb.jpg',
};

const PROJECT_NO_THUMB: ProjectSummary = {
  projectId: 'proj-xyz',
  title: 'No Thumb Project',
  updatedAt: '2026-04-17T08:00:00.000Z',
  thumbnailUrl: null,
};

function renderCard(project: ProjectSummary) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectCard project={project} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatRelativeDate.mockReturnValue('2h ago');
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should render the project title', () => {
    renderCard(PROJECT_WITH_THUMB);
    expect(screen.getByText('My Project')).toBeDefined();
  });

  it('should render the relative date using formatRelativeDate', () => {
    mockFormatRelativeDate.mockReturnValue('3h ago');
    renderCard(PROJECT_WITH_THUMB);
    expect(screen.getByText('3h ago')).toBeDefined();
    expect(mockFormatRelativeDate).toHaveBeenCalledWith(new Date('2026-04-17T10:00:00.000Z'));
  });

  it('should render an img element when thumbnailUrl is provided', () => {
    renderCard(PROJECT_WITH_THUMB);
    const img = screen.getByRole('img', { name: 'My Project' });
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toBe('https://example.com/thumb.jpg');
  });

  it('should render placeholder SVG when thumbnailUrl is null', () => {
    renderCard(PROJECT_NO_THUMB);
    // No broken image — the placeholder SVG has aria-label
    const placeholder = screen.getByRole('img', { name: 'No thumbnail' });
    expect(placeholder).toBeDefined();
    // Ensure no <img> element (which would show broken icon)
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(0);
  });

  it('should navigate to /editor?projectId=<id> when clicked', () => {
    renderCard(PROJECT_WITH_THUMB);
    const card = screen.getByRole('button', { name: /open project: my project/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/editor?projectId=proj-abc');
  });

  it('should navigate when Enter key is pressed', () => {
    renderCard(PROJECT_WITH_THUMB);
    const card = screen.getByRole('button', { name: /open project: my project/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/editor?projectId=proj-abc');
  });

  it('should navigate when Space key is pressed', () => {
    renderCard(PROJECT_NO_THUMB);
    const card = screen.getByRole('button', { name: /open project: no thumb project/i });
    fireEvent.keyDown(card, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/editor?projectId=proj-xyz');
  });

  it('should NOT navigate when an unrelated key is pressed', () => {
    renderCard(PROJECT_WITH_THUMB);
    const card = screen.getByRole('button', { name: /open project: my project/i });
    fireEvent.keyDown(card, { key: 'Tab' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Auth-aware thumbnail src ───────────────────────────────────────────────

  it('should render an authenticated thumbnail src when auth token is set', () => {
    localStorage.setItem('auth_token', 'T');
    renderCard(PROJECT_WITH_THUMB);
    const img = screen.getByRole('img', { name: 'My Project' });
    expect((img as HTMLImageElement).src).toContain('?token=T');
  });

  it('should render the raw thumbnail src when no auth token is set', () => {
    renderCard(PROJECT_WITH_THUMB);
    const img = screen.getByRole('img', { name: 'My Project' });
    expect((img as HTMLImageElement).src).toBe('https://example.com/thumb.jpg');
  });

  it('should still render placeholder SVG when thumbnailUrl is null (with token set)', () => {
    localStorage.setItem('auth_token', 'T');
    renderCard(PROJECT_NO_THUMB);
    const placeholder = screen.getByRole('img', { name: 'No thumbnail' });
    expect(placeholder).toBeDefined();
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(0);
  });
});
