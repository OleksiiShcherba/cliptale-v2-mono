import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — useProjects and useStoryboardCards are mocked so HomePage tests
// don't need a real server. Each panel has its own dedicated test file.
// ---------------------------------------------------------------------------

vi.mock('@/features/home/hooks/useProjects', () => ({
  useProjects: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/features/home/hooks/useStoryboardCards', () => ({
  useStoryboardCards: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/features/home/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  listStoryboardCards: vi.fn(),
}));

// formatRelativeDate is not exercised by these shell-level tests
vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: () => 'just now',
}));

import { HomePage } from './HomePage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderHomePage(initialEntry = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HomePage', () => {
  it('should render both nav tab items', () => {
    renderHomePage();
    expect(screen.getByRole('tab', { name: /projects/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /storyboard/i })).toBeDefined();
  });

  it('should show Projects panel by default (Projects tab active)', () => {
    renderHomePage();

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    expect(projectsTab.getAttribute('aria-selected')).toBe('true');

    const storyboardTab = screen.getByRole('tab', { name: /storyboard/i });
    expect(storyboardTab.getAttribute('aria-selected')).toBe('false');

    // Projects heading is visible in the panel
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
  });

  it('should swap to Storyboard panel when Storyboard tab is clicked', () => {
    renderHomePage();

    const storyboardTab = screen.getByRole('tab', { name: /storyboard/i });
    fireEvent.click(storyboardTab);

    // StoryboardPanel empty state is now visible
    expect(screen.getByText('No storyboards yet')).toBeDefined();
  });

  it('should toggle active-state aria-selected when switching tabs', () => {
    renderHomePage();

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    const storyboardTab = screen.getByRole('tab', { name: /storyboard/i });

    // Initially: Projects active
    expect(projectsTab.getAttribute('aria-selected')).toBe('true');
    expect(storyboardTab.getAttribute('aria-selected')).toBe('false');

    // Click Storyboard
    fireEvent.click(storyboardTab);
    expect(storyboardTab.getAttribute('aria-selected')).toBe('true');
    expect(projectsTab.getAttribute('aria-selected')).toBe('false');

    // Click back to Projects
    fireEvent.click(projectsTab);
    expect(projectsTab.getAttribute('aria-selected')).toBe('true');
    expect(storyboardTab.getAttribute('aria-selected')).toBe('false');
  });

  it('should render the sidebar navigation landmark', () => {
    renderHomePage();
    expect(screen.getByRole('navigation', { name: /home navigation/i })).toBeDefined();
  });

  it('should render the main tabpanel region', () => {
    renderHomePage();
    expect(screen.getByRole('tabpanel')).toBeDefined();
  });

  // ── Subtask 4 — ?tab=storyboard hint ────────────────────────────────────────

  it('should open Storyboard tab when ?tab=storyboard is in the URL', () => {
    renderHomePage('/?tab=storyboard');

    const storyboardTab = screen.getByRole('tab', { name: /storyboard/i });
    expect(storyboardTab.getAttribute('aria-selected')).toBe('true');

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    expect(projectsTab.getAttribute('aria-selected')).toBe('false');

    // StoryboardPanel empty state is visible
    expect(screen.getByText('No storyboards yet')).toBeDefined();
  });

  it('should default to Projects tab when ?tab param is absent', () => {
    renderHomePage('/');

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    expect(projectsTab.getAttribute('aria-selected')).toBe('true');
  });

  it('should default to Projects tab when ?tab has an unrecognised value', () => {
    renderHomePage('/?tab=unknown');

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    expect(projectsTab.getAttribute('aria-selected')).toBe('true');
  });

  // ── Subtask: HomePage scroll fix ────────────────────────────────────────
  // Verify the flex layout is correctly constrained (height: 100vh on outer,
  // minHeight: 0 on <main>) so overflow: auto can work on the content region.
  it('should render main with overflow: auto for scrollable content', () => {
    renderHomePage();

    const main = screen.getByRole('tabpanel');
    const computedStyle = window.getComputedStyle(main);
    expect(computedStyle.overflow).toBe('auto');
  });

  it('should constrain the outer flex container with height: 100vh', () => {
    renderHomePage();

    const mainParent = screen.getByRole('tabpanel').parentElement;
    const computedStyle = window.getComputedStyle(mainParent as HTMLElement);
    expect(computedStyle.height).toBe('100vh');
  });
});
