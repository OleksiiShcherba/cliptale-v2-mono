/**
 * StoryboardPage — asset panel removal tests (SB-CLEAN-1).
 *
 * Covers:
 * - A3: TranscribeButton is NOT present anywhere on the Storyboard page
 * - SB-CLEAN-1: StoryboardAssetPanel is NOT rendered on any tab (panel removed per product decision)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    <div data-testid="wizard-stepper" data-step={currentStep} />
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
  Handle: ({ type, position, id }: { type: string; position: string; id: string }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} />
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

// Mock LibraryPanel to avoid pulling in useQueryClient (which requires
// a QueryClientProvider that this test wrapper does not provide).
vi.mock('@/features/storyboard/components/LibraryPanel');

// Mock useStoryboardHistorySeed — it calls useStoryboardHistoryFetch (React Query)
// which requires a QueryClientProvider. Seed logic is tested in its own unit test.
vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

// Ensure TranscribeButton is not rendered anywhere by mocking it
// so any accidental import would produce a trackable element.
const transcribeRenderSpy = vi.fn();
vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: () => {
    transcribeRenderSpy();
    return <button data-testid="transcribe-button">Transcribe</button>;
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from '@/features/storyboard/components/StoryboardPage';
import { useStoryboardCanvas } from '@/features/storyboard/hooks/useStoryboardCanvas';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(draftId = 'test-draft-storyboard') {
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

describe('StoryboardPage — asset panel (SB-CLEAN-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // ── SB-CLEAN-1: Asset panel absent ──────────────────────────────────────────

  it('does not render StoryboardAssetPanel on the default STORYBOARD tab', () => {
    renderPage('draft-001');
    expect(screen.queryByTestId('storyboard-asset-panel')).toBeNull();
    expect(screen.queryByTestId('storyboard-asset-panel-mock')).toBeNull();
  });

  // ── A3: TranscribeButton absent ──────────────────────────────────────────────

  it('does not render TranscribeButton on the Storyboard page', () => {
    renderPage('draft-001');
    // TranscribeButton mock tracks renders; it must not be called.
    expect(transcribeRenderSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });
});
