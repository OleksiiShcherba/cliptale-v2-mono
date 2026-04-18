/**
 * ProjectsPanel — tests.
 *
 * Covers: loading / empty / error / populated renders, create flow (button
 * disabled during mutation, navigates on success, shows error on failure).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const { mockUseProjects } = vi.hoisted(() => ({
  mockUseProjects: vi.fn(),
}));

vi.mock('@/features/home/hooks/useProjects', () => ({
  useProjects: mockUseProjects,
}));

const { mockCreateProject } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
}));

vi.mock('@/features/home/api', () => ({
  listProjects: vi.fn(),
  createProject: mockCreateProject,
}));

// Mock formatRelativeDate so tests don't depend on real Date.now()
vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: () => '1h ago',
}));

import { ProjectsPanel } from './ProjectsPanel';
import type { ProjectSummary } from '../types';

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
        <ProjectsPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PROJECTS: ProjectSummary[] = [
  {
    projectId: 'proj-1',
    title: 'Alpha',
    updatedAt: new Date().toISOString(),
    thumbnailUrl: null,
  },
  {
    projectId: 'proj-2',
    title: 'Beta',
    updatedAt: new Date().toISOString(),
    thumbnailUrl: 'https://example.com/beta.jpg',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('should render 6 skeleton placeholders while loading', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPanel();
    // Skeletons are aria-hidden — count via DOM query
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBe(6);
  });

  it('should render the Create New Project button while loading', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPanel();
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDefined();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('should render error alert when isError is true', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPanel();
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('Could not load projects');
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('should render empty state copy and centered Create CTA when no projects', () => {
    mockUseProjects.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByText('No projects yet')).toBeDefined();
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDefined();
  });

  // ── Populated state ────────────────────────────────────────────────────────

  it('should render a card for each project when populated', () => {
    mockUseProjects.mockReturnValue({ data: PROJECTS, isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByRole('button', { name: /open project: alpha/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /open project: beta/i })).toBeDefined();
  });

  it('should render the header Create CTA when populated', () => {
    mockUseProjects.mockReturnValue({ data: PROJECTS, isLoading: false, isError: false });
    renderPanel();
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDefined();
  });

  // ── Create flow ────────────────────────────────────────────────────────────

  it('should disable Create button while mutation is in flight', async () => {
    mockUseProjects.mockReturnValue({ data: PROJECTS, isLoading: false, isError: false });
    // Return a promise that never resolves to keep loading state
    mockCreateProject.mockReturnValue(new Promise(() => {}));

    renderPanel();
    const btn = screen.getByRole('button', { name: /create new project/i });
    fireEvent.click(btn);

    await waitFor(() => {
      const updatedBtn = screen.getByRole('button', { name: /creating/i });
      expect(updatedBtn).toBeDefined();
      expect((updatedBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('should navigate to /editor?projectId=<new> on successful create', async () => {
    mockUseProjects.mockReturnValue({ data: PROJECTS, isLoading: false, isError: false });
    mockCreateProject.mockResolvedValue('new-proj-id');

    renderPanel();
    const btn = screen.getByRole('button', { name: /create new project/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/editor?projectId=new-proj-id');
    });
  });

  it('should show inline error text when create fails', async () => {
    mockUseProjects.mockReturnValue({ data: PROJECTS, isLoading: false, isError: false });
    mockCreateProject.mockRejectedValue(new Error('server error'));

    renderPanel();
    const btn = screen.getByRole('button', { name: /create new project/i });
    fireEvent.click(btn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Failed to create project');
    });
  });

  it('should call createProject via apiClient.post (via api module) when Create is clicked', async () => {
    mockUseProjects.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockCreateProject.mockResolvedValue('new-proj-id');

    renderPanel();
    const btn = screen.getByRole('button', { name: /create new project/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledTimes(1);
    });
  });
});
