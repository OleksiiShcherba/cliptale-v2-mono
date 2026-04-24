/**
 * Navigation tests for StoryboardPage — Back, Next, and Home button behaviour.
 *
 * Split from StoryboardPage.test.tsx to comply with the 300-line cap (§9.7).
 *
 * §10 vi.mock hoisting: router, WizardStepper, ReactFlow, useStoryboardCanvas,
 * LibraryPanel, EffectsPanel, and StoryboardAssetPanel are mocked to isolate
 * StoryboardPage.
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

vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep}>
      WizardStepper step {currentStep}
    </div>
  ),
}));

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

vi.mock('@/features/storyboard/components/LibraryPanel', () => ({
  LibraryPanel: ({ draftId }: { draftId: string }) => (
    <div data-testid="library-panel-mock" data-draft-id={draftId} />
  ),
}));

vi.mock('@/features/storyboard/components/EffectsPanel', () => ({
  EffectsPanel: ({ selectedBlockId }: { selectedBlockId: string | null }) => (
    <div data-testid="effects-panel-mock" data-selected-block-id={selectedBlockId ?? ''} />
  ),
}));

vi.mock('./StoryboardAssetPanel', () => ({
  StoryboardAssetPanel: ({ draftId }: { draftId: string }) => (
    <div data-testid="storyboard-asset-panel-stub" data-draft-id={draftId} />
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

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

describe('StoryboardPage / navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Bottom bar navigation ──────────────────────────────────────────────────

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

  // ── Home button ────────────────────────────────────────────────────────────

  it('renders the Home button in the top bar', () => {
    renderPage();
    const homeBtn = screen.getByTestId('home-button');
    expect(homeBtn).toBeTruthy();
    expect(homeBtn.getAttribute('aria-label')).toBe('Go to home');
  });

  it('Home button has correct text label', () => {
    renderPage();
    const homeBtn = screen.getByTestId('home-button');
    expect(homeBtn.textContent).toContain('Home');
  });

  it('clicking Home button navigates to /', () => {
    renderPage();
    const homeBtn = screen.getByTestId('home-button');
    fireEvent.click(homeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
