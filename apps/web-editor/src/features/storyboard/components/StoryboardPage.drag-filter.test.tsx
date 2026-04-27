/**
 * Tests for StoryboardPage — SB-UI-BUG-2: mid-drag position suppression.
 *
 * Verifies that `handleNodesChange` in StoryboardPage:
 *  (a) does NOT update node position for `{ type: 'position', dragging: true }` events
 *  (b) DOES update node position for `{ type: 'position', dragging: false }` events (drag-end)
 *
 * Split from StoryboardPage.test.tsx to respect the 300-line cap (§9.7).
 *
 * Strategy: mock `applyNodeChanges` from @xyflow/react to record the `changes`
 * argument it receives, then assert that mid-drag changes are filtered out before
 * the call, while drag-end changes pass through.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { capturedOnNodesChange, mockApplyNodeChanges } = vi.hoisted(() => ({
  // Captures the onNodesChange prop passed into the StoryboardCanvas mock.
  capturedOnNodesChange: {
    current: null as ((changes: unknown[]) => void) | null,
  },
  mockApplyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
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

// Mock @xyflow/react — capture applyNodeChanges so we can assert on filtered changes.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: mockApplyNodeChanges,
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
  Handle: ({ type, position, id }: { type: string; position: string; id: string }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
}));

// Mock StoryboardCanvas to capture onNodesChange so we can invoke it directly.
vi.mock('./StoryboardCanvas', () => ({
  StoryboardCanvas: ({
    onNodesChange,
    children,
  }: {
    onNodesChange: (changes: unknown[]) => void;
    children?: React.ReactNode;
  }) => {
    capturedOnNodesChange.current = onNodesChange;
    return <div data-testid="storyboard-canvas-mock">{children}</div>;
  },
}));

vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', () => ({
  useStoryboardCanvas: vi.fn(() => ({
    nodes: [
      {
        id: 'node-1',
        type: 'scene-block',
        position: { x: 100, y: 100 },
        data: {},
      },
    ],
    edges: [],
    isLoading: false,
    error: null,
    // setNodes must execute the updater callback so that applyNodeChanges
    // is actually invoked inside handleNodesChange.
    setNodes: vi.fn().mockImplementation((updater: (prev: unknown[]) => unknown[]) => {
      updater([{ id: 'node-1', type: 'scene-block', position: { x: 100, y: 100 }, data: {} }]);
    }),
    setEdges: vi.fn(),
    removeNode: vi.fn(),
  })),
}));

vi.mock('@/features/storyboard/api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
  initializeStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  fetchStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  persistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
  fetchHistorySnapshots: vi.fn().mockResolvedValue([]),
  addTemplateToStoryboard: vi.fn(),
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

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(draftId = 'test-draft-drag') {
  return render(
    <MemoryRouter initialEntries={[`/storyboard/${draftId}`]}>
      <Routes>
        <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests — SB-UI-BUG-2: drag position suppression
// ---------------------------------------------------------------------------

describe('StoryboardPage / handleNodesChange drag-filter (SB-UI-BUG-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset after vi.clearAllMocks so the implementation is still correct.
    mockApplyNodeChanges.mockImplementation((_changes: unknown[], nodes: unknown[]) => nodes);
    capturedOnNodesChange.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT pass mid-drag position changes to applyNodeChanges', () => {
    renderPage();

    // Ensure StoryboardCanvas mounted and captured onNodesChange.
    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const midDragChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 200, y: 200 },
      dragging: true,
    };

    act(() => {
      capturedOnNodesChange.current!([midDragChange]);
    });

    // applyNodeChanges must have been called — but with the mid-drag change filtered out.
    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    // The mid-drag change should NOT be in the array passed to applyNodeChanges.
    expect(passedChanges).not.toContainEqual(
      expect.objectContaining({ type: 'position', dragging: true }),
    );
  });

  it('DOES pass drag-end position changes to applyNodeChanges', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const dragEndChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 300, y: 300 },
      dragging: false,
    };

    act(() => {
      capturedOnNodesChange.current!([dragEndChange]);
    });

    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    // The drag-end change MUST be in the array passed to applyNodeChanges.
    expect(passedChanges).toContainEqual(
      expect.objectContaining({ type: 'position', dragging: false }),
    );
  });

  it('passes non-position changes (select, remove) through unchanged', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const selectChange = { type: 'select', id: 'node-1', selected: true };
    const removeChange = { type: 'remove', id: 'node-1' };

    act(() => {
      capturedOnNodesChange.current!([selectChange, removeChange]);
    });

    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    expect(passedChanges).toContainEqual(expect.objectContaining({ type: 'select' }));
    expect(passedChanges).toContainEqual(expect.objectContaining({ type: 'remove' }));
  });

  it('filters mid-drag changes but keeps drag-end changes in a mixed batch', () => {
    renderPage();

    expect(capturedOnNodesChange.current).toBeTypeOf('function');

    const midDragChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 150, y: 150 },
      dragging: true,
    };
    const dragEndChange = {
      type: 'position',
      id: 'node-1',
      position: { x: 200, y: 200 },
      dragging: false,
    };

    act(() => {
      capturedOnNodesChange.current!([midDragChange, dragEndChange]);
    });

    expect(mockApplyNodeChanges).toHaveBeenCalled();
    const passedChanges = mockApplyNodeChanges.mock.calls[0][0] as unknown[];
    // Mid-drag filtered out; drag-end retained.
    expect(passedChanges).not.toContainEqual(
      expect.objectContaining({ dragging: true }),
    );
    expect(passedChanges).toContainEqual(
      expect.objectContaining({ type: 'position', dragging: false }),
    );
  });
});
