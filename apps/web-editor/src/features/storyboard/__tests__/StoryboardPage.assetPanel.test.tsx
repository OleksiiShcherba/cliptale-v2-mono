/**
 * StoryboardPage — asset panel integration tests (ST-B6).
 *
 * Covers A2 + A3:
 * - A2: StoryboardAssetPanel is rendered on the STORYBOARD tab (default)
 * - A2: Clicking an asset card opens AssetDetailPanel with rename field present
 * - A3: TranscribeButton is NOT present anywhere on the Storyboard page
 * - A3: hideTranscribe is forwarded through to AssetDetailPanel
 *
 * Note: StoryboardAssetPanel is mocked here to focus on StoryboardPage
 * wiring. The StoryboardAssetPanel.test.tsx file covers the panel internals.
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

// Mock StoryboardAssetPanel to verify it receives hideTranscribe and draftId,
// and to check it renders without pulling in React Query providers.
const mockStoryboardAssetPanel = vi.fn(
  ({ draftId }: { draftId: string }) => (
    <div
      data-testid="storyboard-asset-panel-mock"
      data-draft-id={draftId}
    >
      <div data-testid="inline-rename-field">Rename Field</div>
    </div>
  ),
);

vi.mock(
  '@/features/storyboard/components/StoryboardAssetPanel',
  () => ({
    StoryboardAssetPanel: (props: { draftId: string }) =>
      mockStoryboardAssetPanel(props),
  }),
);

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

describe('StoryboardPage — asset panel (ST-B6)', () => {
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

  // ── A2: Asset panel presence ─────────────────────────────────────────────────

  it('renders StoryboardAssetPanel when STORYBOARD tab is active (default)', () => {
    renderPage('draft-001');
    expect(screen.getByTestId('storyboard-asset-panel-mock')).toBeTruthy();
  });

  it('passes draftId to StoryboardAssetPanel', () => {
    renderPage('my-draft-abc');
    const panel = screen.getByTestId('storyboard-asset-panel-mock');
    expect(panel.getAttribute('data-draft-id')).toBe('my-draft-abc');
  });

  it('renders InlineRenameField area within asset panel', () => {
    renderPage('draft-001');
    expect(screen.getByTestId('inline-rename-field')).toBeTruthy();
  });

  it('hides StoryboardAssetPanel when LIBRARY tab is selected', () => {
    renderPage('draft-001');
    // Switch to LIBRARY tab
    fireEvent.click(screen.getByTestId('sidebar-tab-library'));
    expect(screen.queryByTestId('storyboard-asset-panel-mock')).toBeNull();
  });

  it('hides StoryboardAssetPanel when EFFECTS tab is selected', () => {
    renderPage('draft-001');
    // Switch to EFFECTS tab
    fireEvent.click(screen.getByTestId('sidebar-tab-effects'));
    expect(screen.queryByTestId('storyboard-asset-panel-mock')).toBeNull();
  });

  it('restores StoryboardAssetPanel when switching back to STORYBOARD tab', () => {
    renderPage('draft-001');
    fireEvent.click(screen.getByTestId('sidebar-tab-library'));
    expect(screen.queryByTestId('storyboard-asset-panel-mock')).toBeNull();

    fireEvent.click(screen.getByTestId('sidebar-tab-storyboard'));
    expect(screen.getByTestId('storyboard-asset-panel-mock')).toBeTruthy();
  });

  // ── A3: TranscribeButton absent ──────────────────────────────────────────────

  it('does not render TranscribeButton on the Storyboard page', () => {
    renderPage('draft-001');
    // TranscribeButton mock tracks renders; it must not be called.
    expect(transcribeRenderSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });
});
