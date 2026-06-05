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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockSaveStoryboard,
  mockPersistHistorySnapshot,
  mockAddTemplateToStoryboard,
  capturedOnAddTemplate,
  mockCanvasNodes,
  DEFAULT_CANVAS_NODES,
} = vi.hoisted(() => {
  const defaultCanvasNodes = [
    {
      id: 'start',
      type: 'start',
      position: { x: 60, y: 200 },
      data: { label: 'START' },
    },
    {
      id: 'end',
      type: 'end',
      position: { x: 900, y: 200 },
      data: { label: 'END' },
    },
  ] as Node[];

  return {
    mockSaveStoryboard: vi.fn().mockResolvedValue(undefined),
    mockPersistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
    mockAddTemplateToStoryboard: vi.fn(),
    // Allows tests to grab the onAddTemplate prop passed to the LibraryPanel mock.
    capturedOnAddTemplate: { current: null as ((templateId: string) => Promise<void>) | null },
    mockCanvasNodes: { current: defaultCanvasNodes },
    DEFAULT_CANVAS_NODES: defaultCanvasNodes,
  };
});

// Mock the storyboard API — this is what saveNow ultimately calls.
vi.mock('@/features/storyboard/api', () => ({
  saveStoryboard: mockSaveStoryboard,
  initializeStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  fetchStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  persistHistorySnapshot: mockPersistHistorySnapshot,
  fetchHistorySnapshots: vi.fn().mockResolvedValue([]),
  addTemplateToStoryboard: mockAddTemplateToStoryboard,
  fetchStoryboardMusic: vi.fn().mockResolvedValue({ items: [] }),
  updateStoryboardMusicBlock: vi.fn().mockResolvedValue({}),
  generateStoryboardMusicBlock: vi.fn().mockResolvedValue({ items: [] }),
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

vi.mock('@/features/generate-wizard/hooks/useAssets', () => ({
  useAssets: vi.fn(() => ({
    data: { items: [], nextCursor: null, totals: { count: 0, bytesUsed: 0 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
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
vi.mock('@/features/storyboard/hooks/useStoryboardCanvas', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react');
  return {
    useStoryboardCanvas: vi.fn(() => {
      const [nodes, setNodesState] = ReactActual.useState<Node[]>(mockCanvasNodes.current);
      const setNodes: React.Dispatch<React.SetStateAction<Node[]>> = (updater) => {
        setNodesState((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          mockCanvasNodes.current = next;
          return next;
        });
      };

      return {
        nodes,
        edges: [],
        isLoading: false,
        error: null,
        setNodes,
        setEdges: vi.fn(),
        removeNode: vi.fn(),
      };
    }),
  };
});

vi.mock('@/features/storyboard/components/LibraryPanel', () => ({
  LibraryPanel: ({
    draftId,
    onAddTemplate,
  }: {
    draftId: string;
    onAddTemplate: (templateId: string) => Promise<void>;
  }) => {
    // Capture onAddTemplate so tests can invoke it directly to simulate add.
    capturedOnAddTemplate.current = onAddTemplate;
    return <div data-testid="library-panel-mock" data-draft-id={draftId} />;
  },
}));

vi.mock('@/features/storyboard/components/EffectsPanel', () => ({
  EffectsPanel: ({ selectedBlockId }: { selectedBlockId: string | null }) => (
    <div data-testid="effects-panel-mock" data-selected-block-id={selectedBlockId ?? ''} />
  ),
}));

// Mock useStoryboardHistorySeed — it calls useStoryboardHistoryFetch (React Query)
// which requires a QueryClientProvider. Seed logic is tested in its own unit test.
vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardPlanGeneration', () => ({
  useStoryboardPlanGeneration: vi.fn(() => ({
    status: 'idle',
    jobId: null,
    error: null,
    canvasState: null,
    start: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock('@/features/storyboard/utils/captureCanvasThumbnail', () => ({
  captureCanvasThumbnail: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';
import { saveStoryboard, addTemplateToStoryboard } from '@/features/storyboard/api';
import type { StoryboardBlock } from '@/features/storyboard/types';

function resetCanvasNodes(nodes: Node[] = DEFAULT_CANVAS_NODES): void {
  mockCanvasNodes.current = nodes.map((node) => ({ ...node, data: { ...node.data } }));
}

function makeSceneNode(block: StoryboardBlock): Node {
  return {
    id: block.id,
    type: 'scene-block',
    position: { x: block.positionX, y: block.positionY },
    data: { block, onRemove: vi.fn() },
    draggable: true,
    deletable: true,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(draftId = 'test-draft-abc') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/storyboard/${draftId}`]}>
        <Routes>
          <Route path="/storyboard/:draftId" element={<StoryboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardPage / save-on-add (ST-FIX-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetCanvasNodes();
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

  it('calls saveStoryboard when the deferred add-block side effects run', async () => {
    renderPage();

    const addBtn = screen.getByTestId('add-block-button');

    await act(async () => {
      fireEvent.click(addBtn);
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a history entry when the "+" button is clicked (AC-02, T14)', async () => {
    renderPage();

    const addBtn = screen.getByTestId('add-block-button');

    await act(async () => {
      fireEvent.click(addBtn);
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Two-tier saving: the per-change path is lightweight-only; History
    // entries are pushed exclusively by the checkpoint scheduler/manual Save.
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
    expect(saveStoryboard).toHaveBeenCalled();
  });

  it('opens the music modal and saves the created music block from the page Add Music action', async () => {
    const sceneBlock: StoryboardBlock = {
      id: 'scene-1',
      draftId: 'test-draft-abc',
      blockType: 'scene',
      name: 'Opening scene',
      prompt: 'Opening prompt',
      videoPrompt: null,
      durationS: 8,
      positionX: 340,
      positionY: 200,
      sortOrder: 1,
      style: null,
      createdAt: '2026-05-26T00:00:00Z',
      updatedAt: '2026-05-26T00:00:00Z',
      mediaItems: [],
    };
    resetCanvasNodes([
      DEFAULT_CANVAS_NODES[0]!,
      makeSceneNode(sceneBlock),
      DEFAULT_CANVAS_NODES[1]!,
    ]);

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-music-block-button'));
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog', { name: 'Music block inspector' })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    const [, savePayload] = vi.mocked(saveStoryboard).mock.calls[0]!;
    expect(savePayload.musicBlocks).toHaveLength(1);
    expect(savePayload.musicBlocks?.[0]).toEqual(expect.objectContaining({
      sourceMode: 'generate_on_step3',
      startSceneBlockId: 'scene-1',
      endSceneBlockId: 'scene-1',
    }));

    // AC-02 (T14): adding the music block creates NO history entry.
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
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
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    // The indicator should show "Saving…" while the save is in flight.
    const indicator = screen.getByTestId('autosave-indicator');
    expect(indicator.textContent).toBe('Saving…');

    // Resolve the save promise.
    await act(async () => {
      resolvePromise();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After the save resolves, the label should show "Saved just now".
    expect(screen.getByTestId('autosave-indicator').textContent).toBe('Saved just now');
  });
});

// ---------------------------------------------------------------------------
// SB-UI-BUG-1: Library Add — immediate canvas render
// ---------------------------------------------------------------------------

describe('StoryboardPage / library-add (SB-UI-BUG-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetCanvasNodes();
    vi.mocked(saveStoryboard).mockResolvedValue(undefined);
    capturedOnAddTemplate.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes onAddTemplate prop to LibraryPanel when library tab is active', async () => {
    renderPage();

    // Switch to Library tab so LibraryPanel mounts and captures onAddTemplate.
    await act(async () => {
      fireEvent.click(screen.getByTestId('sidebar-tab-library'));
    });

    expect(capturedOnAddTemplate.current).toBeTypeOf('function');
  });

  it('calls addTemplateToStoryboard and saveStoryboard when onAddTemplate is invoked', async () => {
    const fakeBlock: StoryboardBlock = {
      id: 'blk-lib-1',
      draftId: 'test-draft-abc',
      blockType: 'scene',
      name: 'Library Scene',
      prompt: 'p',
      videoPrompt: null,
      durationS: 10,
      positionX: 340,
      positionY: 200,
      sortOrder: 1,
      style: null,
      createdAt: '',
      updatedAt: '',
      mediaItems: [],
    };
    vi.mocked(addTemplateToStoryboard).mockResolvedValue(fakeBlock);

    renderPage();

    // Switch to Library tab so LibraryPanel mounts and captures onAddTemplate.
    await act(async () => {
      fireEvent.click(screen.getByTestId('sidebar-tab-library'));
    });

    // Call the captured onAddTemplate as LibraryPanel would.
    await act(async () => {
      await capturedOnAddTemplate.current!('tpl-lib-1');
    });

    expect(addTemplateToStoryboard).toHaveBeenCalledWith({
      templateId: 'tpl-lib-1',
      draftId: 'test-draft-abc',
    });

    // Advance timers by 1 ms to trigger the deferred setTimeout(() => void saveNow(), 0).
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(1);
  });
});
