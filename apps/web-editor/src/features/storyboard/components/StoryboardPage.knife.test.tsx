/**
 * Tests for StoryboardPage — SB-POLISH-1e: knife tool wiring.
 *
 * Verifies that StoryboardPage correctly:
 *   1. Calls `useStoryboardKnifeTool` hook with required dependencies.
 *   2. Threads `isKnifeActive` and `cutEdge` from the hook to StoryboardCanvas props.
 *   3. Sets `cursorMode = 'knife'` when knife is active, reverts to `'grab'` otherwise.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Node } from '@xyflow/react';

import { StoryboardPage } from './StoryboardPage';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockUseStoryboardKnifeTool } = vi.hoisted(() => ({
  mockUseStoryboardKnifeTool: vi.fn(() => ({
    isKnifeActive: false,
    cutEdge: vi.fn(),
  })),
}));

// ── Mock dependencies ──────────────────────────────────────────────────────────

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: (changes: unknown[], nodes: unknown[]) => nodes,
  applyEdgeChanges: (changes: unknown[], edges: unknown[]) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
}));

vi.mock('@/features/generate-wizard/components/WizardStepper', () => ({
  WizardStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="wizard-stepper" data-step={currentStep} />
  ),
}));

vi.mock('./StoryboardCanvas', () => ({
  StoryboardCanvas: ({ cursorMode, onCutEdge }: any) => (
    <div
      data-testid="storyboard-canvas-mock"
      data-cursor-mode={cursorMode}
      data-has-on-cut-edge={onCutEdge ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../hooks/useStoryboardCanvas', () => ({
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

vi.mock('../hooks/useStoryboardAutosave', () => ({
  useStoryboardAutosave: vi.fn(() => ({
    saveLabel: 'saved',
    saveNow: vi.fn(),
  })),
}));

vi.mock('../hooks/useSceneModal', () => ({
  useSceneModal: vi.fn(() => ({
    editingBlock: null,
    openModal: vi.fn(),
    handleSave: vi.fn(),
    handleDelete: vi.fn(),
    handleClose: vi.fn(),
  })),
}));

vi.mock('../hooks/useStoryboardKeyboard', () => ({
  useStoryboardKeyboard: vi.fn(),
}));

vi.mock('../hooks/useAddBlock', () => ({
  useAddBlock: vi.fn(() => ({ addBlock: vi.fn() })),
  findInsertionPoint: vi.fn(() => null),
  nextSceneIndex: vi.fn(() => 0),
}));

vi.mock('../hooks/useStoryboardHistoryPush', () => ({
  useStoryboardHistoryPush: vi.fn(() => ({ pushSnapshot: vi.fn() })),
}));

vi.mock('../hooks/useHandleAddBlock', () => ({
  useHandleAddBlock: vi.fn(() => ({ handleAddBlock: vi.fn() })),
}));

vi.mock('../hooks/useHandleRestore', () => ({
  useHandleRestore: vi.fn(() => ({ handleRestore: vi.fn() })),
}));

vi.mock('../hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('../hooks/useStoryboardDrag', () => ({
  useStoryboardDrag: vi.fn(() => ({
    dragState: null,
    syncRefs: vi.fn(),
    handleNodeDragStart: vi.fn(),
    handleNodeDrag: vi.fn(),
    handleNodeDragStop: vi.fn(),
  })),
}));

vi.mock('../hooks/useStoryboardKnifeTool', () => ({
  useStoryboardKnifeTool: mockUseStoryboardKnifeTool,
}));

vi.mock('../store/storyboard-history-store', () => ({
  storyboardHistoryStore: {},
  initHistoryStore: vi.fn(),
  destroyHistoryStore: vi.fn(),
}));

vi.mock('../store/storyboard-store', () => ({
  useStoryboardStore: vi.fn(() => ({ selectedBlockId: null })),
  setSelectedBlock: vi.fn(),
}));

vi.mock('./EffectsPanel', () => ({
  EffectsPanel: () => <div data-testid="effects-panel" />,
}));

vi.mock('./EndNode', () => ({
  EndNode: () => <div data-testid="end-node" />,
}));

vi.mock('./LibraryPanel', () => ({
  LibraryPanel: () => <div data-testid="library-panel" />,
}));

vi.mock('./SceneBlockNode', () => ({
  SceneBlockNode: () => <div data-testid="scene-block-node" />,
}));

vi.mock('./SceneModal', () => ({
  SceneModal: () => <div data-testid="scene-modal" />,
}));

vi.mock('./SidebarTab', () => ({
  SidebarTab: () => <div data-testid="sidebar-tab" />,
}));

vi.mock('./StartNode', () => ({
  StartNode: () => <div data-testid="start-node" />,
}));

vi.mock('./StoryboardHistoryPanel', () => ({
  StoryboardHistoryPanel: () => <div data-testid="history-panel" />,
}));

vi.mock('./StoryboardPage.topBar', () => ({
  StoryboardTopBar: () => <div data-testid="top-bar" />,
}));

vi.mock('./storyboardIcons', () => ({
  EffectsIcon: () => <span>Effects</span>,
  LibraryIcon: () => <span>Library</span>,
  StoryboardIcon: () => <span>Storyboard</span>,
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StoryboardPage — knife tool wiring (SB-POLISH-1e)', () => {
  beforeEach(() => {
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: false,
      cutEdge: vi.fn(),
    });
  });

  const renderPage = () => {
    return render(
      <MemoryRouter initialEntries={['/storyboard/test-draft-id']}>
        <Routes>
          <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('calls useStoryboardKnifeTool with required dependencies', async () => {
    renderPage();

    await waitFor(() => {
      expect(mockUseStoryboardKnifeTool).toHaveBeenCalled();
    });

    // Verify the hook is called with the expected structure.
    const callArgs = mockUseStoryboardKnifeTool.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('nodes');
    expect(callArgs).toHaveProperty('setEdges');
    expect(callArgs).toHaveProperty('pushSnapshot');
    expect(callArgs).toHaveProperty('saveNow');
  });

  it('threads knife tool result to StoryboardCanvas: knife inactive sets cursorMode to grab', async () => {
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: false,
      cutEdge: vi.fn(),
    });

    renderPage();

    const canvas = await screen.findByTestId('storyboard-canvas-mock');
    expect(canvas.getAttribute('data-cursor-mode')).toBe('grab');
  });

  it('threads knife tool result to StoryboardCanvas: knife active sets cursorMode to knife', async () => {
    const mockCutEdge = vi.fn();
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: true,
      cutEdge: mockCutEdge,
    });

    renderPage();

    const canvas = await screen.findByTestId('storyboard-canvas-mock');
    expect(canvas.getAttribute('data-cursor-mode')).toBe('knife');
  });

  it('threads cutEdge callback to StoryboardCanvas when knife is active', async () => {
    const mockCutEdge = vi.fn();
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: true,
      cutEdge: mockCutEdge,
    });

    renderPage();

    const canvas = await screen.findByTestId('storyboard-canvas-mock');
    expect(canvas.getAttribute('data-has-on-cut-edge')).toBe('true');
  });

  it('transitions from grab to knife mode when isKnifeActive becomes true', async () => {
    // Start in grab mode
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: false,
      cutEdge: vi.fn(),
    });

    renderPage();

    let canvases = screen.getAllByTestId('storyboard-canvas-mock');
    expect(canvases[0].getAttribute('data-cursor-mode')).toBe('grab');

    // Switch to knife mode by updating the mock return value
    mockUseStoryboardKnifeTool.mockReturnValue({
      isKnifeActive: true,
      cutEdge: vi.fn(),
    });

    // Re-render with new mock state
    renderPage();

    canvases = screen.getAllByTestId('storyboard-canvas-mock');
    // Use the last rendered canvas element
    expect(canvases[canvases.length - 1].getAttribute('data-cursor-mode')).toBe('knife');
  });
});
