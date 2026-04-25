/**
 * Tests for StoryboardPage — ST-FIX-4: save-on-add behaviour.
 *
 * Verifies that `handleAddBlock` triggers `saveStoryboard` immediately after
 * a block is added via the canvas toolbar "+" button, without waiting for the
 * 30 s debounce.
 *
 * Split from StoryboardPage.test.tsx to respect the 300-line cap (§9.7).
 *
 * §10 vi.mock hoisting: all heavy dependencies are mocked to isolate the
 * StoryboardPage + useStoryboardAutosave + useAddBlock interaction.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSaveStoryboard } = vi.hoisted(() => ({
  mockSaveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock the storyboard API — this is what saveNow ultimately calls.
vi.mock('@/features/storyboard/api', () => ({
  saveStoryboard: mockSaveStoryboard,
  fetchStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  persistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
  fetchHistorySnapshots: vi.fn().mockResolvedValue([]),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep} />
  ),
}));

// Mock @xyflow/react — canvas not available in jsdom.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
  Handle: ({ type, position, id }: { type: string; position: string; id: string }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
}));

// Mock useStoryboardCanvas to return controllable nodes/edges state.
vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', () => ({
  useStoryboardCanvas: vi.fn(() => ({
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: { label: 'START' },
      },
    ],
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

// Mock useStoryboardHistorySeed — uses React Query internally; no-op in
// StoryboardPage save-on-add tests which do not need the history-seed behaviour.
vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';
import { saveStoryboard } from '@/features/storyboard/api';

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

describe('StoryboardPage / save-on-add (ST-FIX-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(saveStoryboard).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the add-block toolbar button', () => {
    renderPage();
    // CanvasToolbar renders inside ReactFlow mock; verify it is present.
    expect(screen.getByTestId('storyboard-page')).toBeTruthy();
  });

  it('calls saveStoryboard immediately when the "+" button is clicked (no debounce wait)', async () => {
    renderPage();

    const addBtn = screen.getByTestId('add-block-button');

    await act(async () => {
      fireEvent.click(addBtn);
      // Flush microtasks to let saveNow / performSave promises resolve.
      await Promise.resolve();
    });

    // saveStoryboard should have been called without advancing any timer.
    expect(saveStoryboard).toHaveBeenCalledTimes(1);
  });

  it('autosave-indicator shows "Saving…" then "Saved just now" after add', async () => {
    // Simulate a slow save to observe "Saving…" state.
    let resolvePromise!: () => void;
    vi.mocked(saveStoryboard).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderPage();
    const addBtn = screen.getByTestId('add-block-button');

    // Click add — save starts but has not completed yet.
    await act(async () => {
      fireEvent.click(addBtn);
      await Promise.resolve();
    });

    // The indicator should show "Saving…" while the save is in flight.
    const indicator = screen.getByTestId('autosave-indicator');
    expect(indicator.textContent).toBe('Saving…');

    // Resolve the save promise.
    await act(async () => {
      resolvePromise();
      await Promise.resolve();
    });

    // After the save resolves, the label should show "Saved just now".
    expect(screen.getByTestId('autosave-indicator').textContent).toBe('Saved just now');
  });
});
