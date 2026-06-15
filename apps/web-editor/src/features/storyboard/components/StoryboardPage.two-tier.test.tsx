/**
 * Tests for StoryboardPage — two-tier saving wiring
 * (storyboard-autosave-checkpoints T14, AC-01 / AC-02 / AC-03 / AC-06).
 *
 * Covers:
 * 1. AC-02: N consecutive canvas changes produce ZERO history pushes — only
 *    lightweight saves (PUT /storyboards) happen per change.
 * 2. AC-06: the checkpoint countdown bar is mounted in the top bar.
 * 3. AC-03/AC-07: the manual Save button pushes exactly one checkpoint and the
 *    full-screen capture overlay is visible only while it runs.
 * 4. AC-01: the existing lightweight autosave indicator still works alongside.
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
  mockPushCheckpointSnapshot,
  mockCaptureWithFallback,
  mockCanvasNodes,
  DEFAULT_CANVAS_NODES,
} = vi.hoisted(() => {
  const defaultCanvasNodes = [
    { id: 'start', type: 'start', position: { x: 60, y: 200 }, data: { label: 'START' } },
    { id: 'end', type: 'end', position: { x: 900, y: 200 }, data: { label: 'END' } },
  ] as Node[];

  return {
    mockSaveStoryboard: vi.fn().mockResolvedValue(undefined),
    mockPersistHistorySnapshot: vi.fn().mockResolvedValue(undefined),
    mockPushCheckpointSnapshot: vi.fn().mockResolvedValue(undefined),
    mockCaptureWithFallback: vi.fn().mockResolvedValue({ kind: 'minimap' as const }),
    mockCanvasNodes: { current: defaultCanvasNodes },
    DEFAULT_CANVAS_NODES: defaultCanvasNodes,
  };
});

vi.mock('@/features/storyboard/api', () => ({
  // T15: usePipelineState (via useStoryboardGenerationFlow) calls this.
  getPipelineState: vi.fn().mockResolvedValue({
    draft_id: 'test-draft-2tier', active_phase: 'cast_extraction', active_run_phase: null,
    phases: {}, payload: null, version: 1, cost_estimate: null, error_message: null, updated_at: null,
  }),
  getLatestCastExtraction: vi.fn().mockResolvedValue(null),
  startCastExtraction: vi.fn().mockResolvedValue({ jobId: 'cast-auto', status: 'queued' }),
  saveStoryboard: mockSaveStoryboard,
  initializeStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  fetchStoryboard: vi.fn().mockResolvedValue({ blocks: [], edges: [] }),
  persistHistorySnapshot: mockPersistHistorySnapshot,
  pushCheckpointSnapshot: mockPushCheckpointSnapshot,
  fetchHistorySnapshots: vi.fn().mockResolvedValue([]),
  addTemplateToStoryboard: vi.fn(),
  fetchStoryboardMusic: vi.fn().mockResolvedValue({ items: [] }),
  updateStoryboardMusicBlock: vi.fn().mockResolvedValue({}),
  generateStoryboardMusicBlock: vi.fn().mockResolvedValue({ items: [] }),
}));

// T15: usePipelineState subscribes to realtime events.
vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn(),
}));

vi.mock('@/features/settings/api', () => ({
  fetchMySettings: vi.fn().mockResolvedValue({ autosaveIntervalSeconds: 60, updatedAt: null }),
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS: 60,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
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

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-mock">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: vi.fn((_changes: unknown[], nodes: unknown[]) => nodes),
  applyEdgeChanges: vi.fn((_changes: unknown[], edges: unknown[]) => edges),
  Handle: ({ type, id }: { type: string; id: string }) => (
    <div data-testid={`handle-${type}-${id}`} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ getNodes: vi.fn(() => []), zoomTo: vi.fn() }),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
}));

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
  LibraryPanel: () => <div data-testid="library-panel-mock" />,
}));

vi.mock('@/features/storyboard/components/EffectsPanel', () => ({
  EffectsPanel: () => <div data-testid="effects-panel-mock" />,
}));

vi.mock('@/features/storyboard/hooks/useStoryboardHistorySeed', () => ({
  useStoryboardHistorySeed: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useStoryboardPlanGeneration', () => ({
  useStoryboardPlanGeneration: vi.fn(() => ({
    status: 'idle', jobId: null, error: null, canvasState: null,
    start: vi.fn(), retry: vi.fn(), reset: vi.fn(),
  })),
}));

vi.mock('@/features/storyboard/utils/captureCanvasThumbnail', () => ({
  captureCanvasThumbnail: vi.fn().mockResolvedValue(null),
  captureCanvasThumbnailWithFallback: mockCaptureWithFallback,
  CAPTURE_TIMEOUT_MS: 5_000,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { StoryboardPage } from './StoryboardPage';
import { pushCheckpointSnapshot, saveStoryboard } from '@/features/storyboard/api';

function resetCanvasNodes(): void {
  mockCanvasNodes.current = DEFAULT_CANVAS_NODES.map((node) => ({
    ...node,
    data: { ...node.data },
  }));
}

function renderPage(draftId = 'test-draft-2tier') {
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetCanvasNodes();
  mockSaveStoryboard.mockResolvedValue(undefined);
  mockCaptureWithFallback.mockResolvedValue({ kind: 'minimap' as const });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoryboardPage — two-tier saving (AC-02)', () => {
  it('N consecutive changes produce ZERO history pushes — only lightweight saves', async () => {
    renderPage();
    const addBtn = screen.getByTestId('add-block-button');

    // Three consecutive canvas changes.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(addBtn);
        vi.advanceTimersByTime(10);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // Lightweight save ran (save-on-add path), history did NOT.
    expect(saveStoryboard).toHaveBeenCalled();
    expect(mockPersistHistorySnapshot).not.toHaveBeenCalled();
    expect(pushCheckpointSnapshot).not.toHaveBeenCalled();
  });
});

describe('StoryboardPage — checkpoint bar + overlay (AC-03 / AC-06)', () => {
  it('mounts the countdown bar in the top bar', () => {
    renderPage();
    expect(screen.getByTestId('checkpoint-countdown-bar')).toBeTruthy();
  });

  it('does not show the capture overlay while no checkpoint runs', () => {
    renderPage();
    expect(screen.queryByTestId('checkpoint-capture-overlay')).toBeNull();
  });

  it('manual Save pushes exactly one checkpoint; overlay visible only during it', async () => {
    let resolveCapture!: (r: { kind: 'minimap' }) => void;
    mockCaptureWithFallback.mockImplementation(
      () => new Promise((resolve) => { resolveCapture = resolve; }),
    );

    renderPage();

    // A change makes the canvas dirty → the Save button becomes active.
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-block-button'));
      vi.advanceTimersByTime(10);
      await Promise.resolve();
    });

    const saveBtn = screen.getByRole('button', { name: /save checkpoint now/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    // Trigger the manual checkpoint — capture is pending → overlay visible.
    await act(async () => {
      fireEvent.click(saveBtn);
      await Promise.resolve();
    });
    expect(screen.getByTestId('checkpoint-capture-overlay')).toBeTruthy();

    // Finish the capture → POST happens, overlay goes away.
    await act(async () => {
      resolveCapture({ kind: 'minimap' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pushCheckpointSnapshot).toHaveBeenCalledTimes(1);
    const [draftArg, , previewKindArg] = vi.mocked(pushCheckpointSnapshot).mock.calls[0]!;
    expect(draftArg).toBe('test-draft-2tier');
    expect(previewKindArg).toBe('minimap');
    expect(screen.queryByTestId('checkpoint-capture-overlay')).toBeNull();
  });
});

describe('StoryboardPage — lightweight indicator still works alongside (AC-01)', () => {
  it('autosave indicator shows the saved state after an add', async () => {
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-block-button'));
      vi.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('autosave-indicator').textContent).toBe('Saved just now');
  });
});
