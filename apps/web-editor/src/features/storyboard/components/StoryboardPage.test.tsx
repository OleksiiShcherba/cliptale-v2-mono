/**
 * Tests for StoryboardPage shell — subtask 4 (updated in subtask 5).
 *
 * Verifies:
 * - Page renders without crashing at /storyboard/some-draft-id
 * - Top bar is present (logo, autosave indicator, icon buttons)
 * - WizardStepper is embedded (step 2 active)
 * - Left sidebar has 3 tabs (STORYBOARD, LIBRARY, EFFECTS)
 * - STORYBOARD tab is active by default
 * - Back button navigates to /generate?draftId=<id>
 * - Next Step 3 button is present
 * - Canvas shows loading state while initializing
 *
 * §10 vi.mock hoisting: router, WizardStepper, ReactFlow, and useStoryboardCanvas
 * are mocked to isolate StoryboardPage.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock WizardStepper to avoid rendering a full stepper in unit tests.
vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep}>
      WizardStepper step {currentStep}
    </div>
  ),
}));

// Mock @xyflow/react — ReactFlow requires a browser canvas environment not
// available in jsdom; stub it out entirely.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: vi.fn((changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((changes: unknown[], edges: unknown[]) => edges),
  Handle: ({ type, position, id, style, 'aria-label': ariaLabel }: {
    type: string;
    position: string;
    id: string;
    style?: React.CSSProperties;
    'aria-label'?: string;
  }) => (
    <div
      data-testid={`handle-${type}-${id}`}
      data-position={position}
      style={style}
      aria-label={ariaLabel}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []) }),
}));

// Mock useStoryboardCanvas so tests don't need a real API.
vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', () => ({
  useStoryboardCanvas: vi.fn(() => ({
    nodes: [],
    edges: [],
    isLoading: false,
    error: null,
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    removeNode: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';
import { useStoryboardCanvas } from '../hooks/useStoryboardCanvas';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

/**
 * Renders StoryboardPage inside a MemoryRouter with /storyboard/:draftId route.
 * The default draftId is 'test-draft-abc'.
 */
function renderPage(draftId = 'test-draft-abc') {
  return render(
    <MemoryRouter initialEntries={[`/storyboard/${draftId}`]}>
      <Routes>
        <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset useStoryboardCanvas mock to default (loaded, no error).
    vi.mocked(useStoryboardCanvas).mockReturnValue({
      nodes: [],
      edges: [],
      isLoading: false,
      error: null,
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      removeNode: vi.fn(),
    });
  });

  it('renders without crashing', () => {
    renderPage();
    expect(screen.getByTestId('storyboard-page')).toBeTruthy();
  });

  it('renders the ClipTale logo in the top bar', () => {
    renderPage();
    expect(screen.getByText('ClipTale')).toBeTruthy();
  });

  it('embeds WizardStepper with currentStep=2', () => {
    renderPage();
    const stepper = screen.getByTestId('wizard-stepper');
    expect(stepper).toBeTruthy();
    expect(stepper.getAttribute('data-step')).toBe('2');
  });

  it('renders the autosave indicator area', () => {
    renderPage();
    expect(screen.getByTestId('autosave-indicator')).toBeTruthy();
    // Renders "—" as placeholder (wired in subtask 8)
    expect(screen.getByTestId('autosave-indicator').textContent).toBe('—');
  });

  it('renders settings and help icon buttons in the top bar', () => {
    renderPage();
    expect(screen.getByTestId('settings-icon-button')).toBeTruthy();
    expect(screen.getByTestId('help-icon-button')).toBeTruthy();
  });

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  it('sidebar has 3 tabs', () => {
    renderPage();
    const sidebar = screen.getByTestId('storyboard-sidebar');
    const tabs = sidebar.querySelectorAll('[data-testid^="sidebar-tab-"]');
    expect(tabs.length).toBe(3);
  });

  it('STORYBOARD tab is active by default (aria-pressed=true)', () => {
    renderPage();
    const storyboardTab = screen.getByTestId('sidebar-tab-storyboard');
    expect(storyboardTab.getAttribute('aria-pressed')).toBe('true');
  });

  it('LIBRARY tab is inactive by default', () => {
    renderPage();
    const libraryTab = screen.getByTestId('sidebar-tab-library');
    expect(libraryTab.getAttribute('aria-pressed')).toBe('false');
  });

  it('EFFECTS tab is inactive by default', () => {
    renderPage();
    const effectsTab = screen.getByTestId('sidebar-tab-effects');
    expect(effectsTab.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking LIBRARY tab makes it active and deactivates STORYBOARD', () => {
    renderPage();
    const libraryTab = screen.getByTestId('sidebar-tab-library');
    fireEvent.click(libraryTab);
    expect(libraryTab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('sidebar-tab-storyboard').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking EFFECTS tab makes it active', () => {
    renderPage();
    const effectsTab = screen.getByTestId('sidebar-tab-effects');
    fireEvent.click(effectsTab);
    expect(effectsTab.getAttribute('aria-pressed')).toBe('true');
  });

  // ── Canvas area ──────────────────────────────────────────────────────────────

  it('renders the storyboard canvas container', () => {
    renderPage();
    expect(screen.getByTestId('storyboard-canvas')).toBeTruthy();
  });

  it('shows the ReactFlow canvas when loaded', () => {
    renderPage();
    expect(screen.getByTestId('react-flow-mock')).toBeTruthy();
  });

  it('shows a loading indicator while canvas is initializing', () => {
    vi.mocked(useStoryboardCanvas).mockReturnValue({
      nodes: [],
      edges: [],
      isLoading: true,
      error: null,
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      removeNode: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('canvas-loading')).toBeTruthy();
  });

  it('shows an error message when canvas fails to load', () => {
    vi.mocked(useStoryboardCanvas).mockReturnValue({
      nodes: [],
      edges: [],
      isLoading: false,
      error: 'API unavailable',
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      removeNode: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('canvas-error')).toBeTruthy();
    expect(screen.getByTestId('canvas-error').textContent).toContain('API unavailable');
  });

  // ── Bottom bar ───────────────────────────────────────────────────────────────

  it('renders the "STEP 2: STORYBOARD" label in the bottom bar', () => {
    renderPage();
    expect(screen.getByText(/step 2.*storyboard/i)).toBeTruthy();
  });

  it('Back button is present with correct aria-label', () => {
    renderPage();
    const backBtn = screen.getByTestId('back-button');
    expect(backBtn).toBeTruthy();
    expect(backBtn.getAttribute('aria-label')).toBe('Back to Step 1');
  });

  it('Back button navigates to /generate?draftId=<draftId>', () => {
    renderPage('my-draft-id');
    const backBtn = screen.getByTestId('back-button');
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/generate?draftId=my-draft-id');
  });

  it('"Next: Step 3 →" button is present', () => {
    renderPage();
    const nextBtn = screen.getByTestId('next-step3-button');
    expect(nextBtn).toBeTruthy();
    expect(nextBtn.getAttribute('aria-label')).toBe('Next: Step 3');
  });

  it('"Next: Step 3 →" button navigates to /generate/road-map', () => {
    renderPage();
    const nextBtn = screen.getByTestId('next-step3-button');
    fireEvent.click(nextBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/generate/road-map');
  });
});
