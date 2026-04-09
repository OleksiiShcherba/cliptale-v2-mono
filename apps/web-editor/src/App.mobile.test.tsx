import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/features/asset-manager/components/AssetBrowserPanel', () => ({
  AssetBrowserPanel: ({ projectId }: { projectId: string }) =>
    React.createElement('div', { 'data-testid': 'asset-browser-panel', 'data-project-id': projectId }),
}));

vi.mock('@/features/preview/components/PreviewPanel', () => ({
  PreviewPanel: () => React.createElement('div', { 'data-testid': 'preview-panel' }),
}));

vi.mock('@/features/preview/components/PlaybackControls', () => ({
  PlaybackControls: () => React.createElement('div', { 'data-testid': 'playback-controls' }),
}));

vi.mock('@/features/preview/hooks/useRemotionPlayer', () => ({
  useRemotionPlayer: vi.fn(() => ({ playerRef: { current: null } })),
}));

vi.mock('@/features/captions/components/CaptionEditorPanel', () => ({
  CaptionEditorPanel: () => React.createElement('div', { 'data-testid': 'caption-editor-panel' }),
}));

vi.mock('@/features/timeline/components/ImageClipEditorPanel', () => ({
  ImageClipEditorPanel: () => React.createElement('div', { 'data-testid': 'image-clip-editor-panel' }),
}));

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: vi.fn(),
  setSelectedClips: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  useProjectStore: vi.fn(),
  getSnapshot: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  setProject: vi.fn(),
  setProjectSilent: vi.fn(),
  getCurrentVersionId: vi.fn().mockReturnValue(7),
  useCurrentVersionId: vi.fn().mockReturnValue(7),
  setCurrentVersionId: vi.fn(),
}));

vi.mock('@/store/history-store', () => ({
  drainPatches: vi.fn().mockReturnValue({ patches: [], inversePatches: [] }),
  hasPendingPatches: vi.fn().mockReturnValue(false),
  useHistoryStore: vi.fn().mockReturnValue({ canUndo: false, canRedo: false }),
  undo: vi.fn().mockReturnValue(null),
  redo: vi.fn().mockReturnValue(null),
}));

vi.mock('@/features/version-history/hooks/useAutosave', () => ({
  useAutosave: vi.fn().mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false }),
}));

vi.mock('@/features/version-history/components/VersionHistoryPanel', () => ({
  VersionHistoryPanel: () => React.createElement('div', { 'data-testid': 'version-history-panel' }),
}));

vi.mock('@/features/export/components/ExportModal', () => ({
  ExportModal: () => React.createElement('div', { 'data-testid': 'export-modal' }),
}));

vi.mock('@/features/export/components/RendersQueueModal', () => ({
  RendersQueueModal: () => React.createElement('div', { 'data-testid': 'renders-queue-modal' }),
}));

vi.mock('@/features/export/hooks/useListRenders', () => ({
  useListRenders: vi.fn().mockReturnValue({ renders: [], isLoading: false, error: null, activeCount: 0 }),
}));

vi.mock('@/features/timeline/components/TimelinePanel', () => ({
  TimelinePanel: () => React.createElement('div', { 'data-testid': 'timeline-panel' }),
}));

vi.mock('@/features/project/hooks/useProjectInit', () => ({
  useProjectInit: vi.fn(),
}));

vi.mock('@/shared/hooks/useWindowWidth', () => ({
  useWindowWidth: vi.fn().mockReturnValue(375),
}));

vi.mock('@/features/preview/components/MobileInspectorTabs', () => ({
  MobileInspectorTabs: ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) =>
    React.createElement('nav', {
      'data-testid': 'mobile-inspector-tabs',
      'data-active-tab': activeTab,
      onClick: () => onTabChange('captions'),
    }),
}));

vi.mock('@/features/preview/components/MobileBottomBar', () => ({
  MobileBottomBar: ({ onAddClip, onAI, canExport, onExport }: {
    onAddClip: () => void;
    onAI: () => void;
    canExport: boolean;
    onExport: () => void;
  }) =>
    React.createElement('nav', {
      'data-testid': 'mobile-bottom-bar',
      'data-can-export': String(canExport),
    }, [
      React.createElement('button', { key: 'add', onClick: onAddClip, 'data-testid': 'mobile-add-clip' }),
      React.createElement('button', { key: 'ai', onClick: onAI, 'data-testid': 'mobile-ai' }),
      React.createElement('button', { key: 'export', onClick: onExport, 'data-testid': 'mobile-export' }),
    ]),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { userId: 'test-user', email: 'test@example.com', displayName: 'Test User' },
    isLoading: false,
    setSession: vi.fn(),
    logout: vi.fn(),
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
  };
});

import * as ephemeralStoreModule from '@/store/ephemeral-store';
import * as projectStoreModule from '@/store/project-store';
import * as autosaveModule from '@/features/version-history/hooks/useAutosave';
import * as useProjectInitModule from '@/features/project/hooks/useProjectInit';
import * as useWindowWidthModule from '@/shared/hooks/useWindowWidth';
import { App } from './App.js';
import { makeProjectDoc } from './App.fixtures';

const TEST_PROJECT_ID = 'test-project-mobile-001';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);
const mockUseAutosave = vi.mocked(autosaveModule.useAutosave);
const mockUseWindowWidth = vi.mocked(useWindowWidthModule.useWindowWidth);
const mockUseProjectInit = vi.mocked(useProjectInitModule.useProjectInit);

// ---------------------------------------------------------------------------
// Mobile layout — App renders vertical stack when windowWidth < 768
// ---------------------------------------------------------------------------

describe('App mobile layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWindowWidth.mockReturnValue(375);
    mockUseProjectInit.mockReturnValue({ status: 'ready', projectId: TEST_PROJECT_ID });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc() as ReturnType<typeof mockUseProjectStore>,
    );
    mockUseAutosave.mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false });
  });

  it('renders MobileInspectorTabs when windowWidth < 768', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-inspector-tabs')).toBeTruthy();
  });

  it('renders MobileBottomBar when windowWidth < 768', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-bottom-bar')).toBeTruthy();
  });

  it('does not render the desktop asset browser sidebar when windowWidth < 768', () => {
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Left sidebar' })).toBeNull();
  });

  it('renders a main landmark with label "Preview" in mobile layout', () => {
    render(<App />);
    expect(screen.getByRole('main', { name: 'Preview' })).toBeTruthy();
  });

  it('does not render mobile components when windowWidth >= 768 (desktop)', () => {
    mockUseWindowWidth.mockReturnValue(1440);
    render(<App />);
    expect(screen.queryByTestId('mobile-inspector-tabs')).toBeNull();
    expect(screen.queryByTestId('mobile-bottom-bar')).toBeNull();
  });

  it('renders desktop asset browser sidebar when windowWidth >= 768', () => {
    mockUseWindowWidth.mockReturnValue(768);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Left sidebar' })).toBeTruthy();
  });

  it('MobileBottomBar onAddClip switches tab to assets', () => {
    render(<App />);
    const bar = screen.getByTestId('mobile-bottom-bar');
    const addBtn = bar.querySelector('[data-testid="mobile-add-clip"]') as HTMLElement;
    fireEvent.click(addBtn);
    const tabs = screen.getByTestId('mobile-inspector-tabs');
    expect(tabs.getAttribute('data-active-tab')).toBe('assets');
  });

  it('MobileBottomBar onAI switches tab to captions', () => {
    render(<App />);
    const bar = screen.getByTestId('mobile-bottom-bar');
    const aiBtn = bar.querySelector('[data-testid="mobile-ai"]') as HTMLElement;
    fireEvent.click(aiBtn);
    const tabs = screen.getByTestId('mobile-inspector-tabs');
    expect(tabs.getAttribute('data-active-tab')).toBe('captions');
  });

  it('mobile layout still renders the top bar', () => {
    render(<App />);
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('MobileBottomBar receives canExport=false when currentVersionId is null', () => {
    vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(null);
    render(<App />);
    const bar = screen.getByTestId('mobile-bottom-bar');
    expect(bar.getAttribute('data-can-export')).toBe('false');
  });

  it('MobileBottomBar receives canExport=true when currentVersionId is non-null', () => {
    vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(5);
    render(<App />);
    const bar = screen.getByTestId('mobile-bottom-bar');
    expect(bar.getAttribute('data-can-export')).toBe('true');
  });

  it('inspector content panel is rendered outside (after) the main Preview landmark', () => {
    render(<App />);
    // The inspector content div has aria-label matching the active tab name (e.g. "assets panel")
    // It is NOT inside the main Preview landmark — it sits below it in the flex column.
    const panel = screen.getByLabelText('assets panel');
    expect(panel).not.toBeNull();
    // The main Preview landmark should NOT contain the inspector panel
    const main = screen.getByRole('main', { name: 'Preview' });
    expect(main.contains(panel)).toBe(false);
  });

  it('preview panel is rendered inside the main Preview landmark', () => {
    render(<App />);
    // Regression guard: <main aria-label="Preview"> must contain the Remotion player area.
    // The old bug put the inspector overlay inside <main>, covering the preview.
    // This test ensures the preview panel is always a child of the Preview landmark.
    const main = screen.getByRole('main', { name: 'Preview' });
    const previewPanel = screen.getByTestId('preview-panel');
    expect(main.contains(previewPanel)).toBe(true);
  });

  it('inspector content panel aria-label updates when active tab changes via MobileInspectorTabs', () => {
    render(<App />);
    // Default active tab is 'assets'
    expect(screen.getByLabelText('assets panel')).not.toBeNull();
    // Simulate tab change via the mocked MobileInspectorTabs click handler
    const tabs = screen.getByTestId('mobile-inspector-tabs');
    fireEvent.click(tabs); // mock fires onTabChange('captions')
    expect(screen.getByLabelText('captions panel')).not.toBeNull();
    expect(screen.queryByLabelText('assets panel')).toBeNull();
  });
});
