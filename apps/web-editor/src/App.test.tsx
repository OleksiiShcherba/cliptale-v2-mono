import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
  CaptionEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'caption-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/features/timeline/components/ImageClipEditorPanel', () => ({
  ImageClipEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'image-clip-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: vi.fn(),
  setSelectedClips: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  getSnapshot: vi.fn(() => ({
    playheadFrame: 0,
    zoom: 1,
    pxPerFrame: 4,
    scrollOffsetX: 0,
    selectedClipIds: [],
    volume: 1,
    isMuted: false,
  })),
  setAll: vi.fn(),
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
  VersionHistoryPanel: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', {
      'data-testid': 'version-history-panel',
      onClick: onClose,
    }),
}));

vi.mock('@/features/export/components/ExportModal', () => ({
  ExportModal: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'export-modal', onClick: onClose }),
}));

vi.mock('@/features/export/components/RendersQueueModal', () => ({
  RendersQueueModal: ({ onClose }: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'renders-queue-modal', onClick: onClose }),
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
  useWindowWidth: vi.fn().mockReturnValue(1440),
}));

vi.mock('@/features/preview/components/MobileInspectorTabs', () => ({
  MobileInspectorTabs: () => React.createElement('nav', { 'data-testid': 'mobile-inspector-tabs' }),
}));

vi.mock('@/features/preview/components/MobileBottomBar', () => ({
  MobileBottomBar: () => React.createElement('nav', { 'data-testid': 'mobile-bottom-bar' }),
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

const TEST_PROJECT_ID = 'test-project-app-001';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);
const mockUseAutosave = vi.mocked(autosaveModule.useAutosave);
const mockUseWindowWidth = vi.mocked(useWindowWidthModule.useWindowWidth);
const mockUseProjectInit = vi.mocked(useProjectInitModule.useProjectInit);

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWindowWidth.mockReturnValue(1440);
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

  describe('two-column shell layout', () => {
    it('renders without crashing', () => {
      render(<App />);
    });

    it('renders AssetBrowserPanel in a sidebar aside element', () => {
      render(<App />);
      const sidebar = screen.getByRole('complementary', { name: 'Left sidebar' });
      expect(sidebar).toBeTruthy();
      expect(sidebar.querySelector('[data-testid="asset-browser-panel"]')).toBeTruthy();
    });

    it('passes the projectId from useProjectInit to AssetBrowserPanel', () => {
      render(<App />);
      const panel = screen.getByTestId('asset-browser-panel');
      expect(panel.getAttribute('data-project-id')).toBe(TEST_PROJECT_ID);
    });

    it('renders a loading state when useProjectInit returns status loading', () => {
      mockUseProjectInit.mockReturnValue({ status: 'loading', projectId: null });
      render(<App />);
      expect(screen.getByText('Loading project…')).toBeTruthy();
    });

    it('renders an error state when useProjectInit returns status error', () => {
      mockUseProjectInit.mockReturnValue({ status: 'error', projectId: null, error: 'Could not create project' });
      render(<App />);
      expect(screen.getByText('Could not create project')).toBeTruthy();
    });

    it('renders PreviewPanel in the main content area', () => {
      render(<App />);
      const main = screen.getByRole('main');
      expect(main.querySelector('[data-testid="preview-panel"]')).toBeTruthy();
    });

    it('renders PlaybackControls in the main content area', () => {
      render(<App />);
      const main = screen.getByRole('main');
      expect(main.querySelector('[data-testid="playback-controls"]')).toBeTruthy();
    });
  });

  describe('sidebar', () => {
    it('renders sidebar as an aside landmark with accessible label', () => {
      render(<App />);
      const sidebar = screen.getByRole('complementary', { name: 'Left sidebar' });
      expect(sidebar).toBeTruthy();
    });
  });

  describe('vertical divider', () => {
    it('renders a decorative divider element between sidebar and main', () => {
      const { container } = render(<App />);
      const shell = container.firstChild as HTMLElement;
      const shellChildren = Array.from(shell.children);
      expect(shellChildren.length).toBe(4); // TopBar + editorRow + ResizeHandle + TimelinePanel
      const editorRow = shellChildren[1] as HTMLElement;
      const editorRowChildren = Array.from(editorRow.children);
      expect(editorRowChildren.length).toBeGreaterThanOrEqual(3);
      const divider = editorRowChildren[1] as HTMLElement;
      expect(divider.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('top bar', () => {
    it('renders a header element with the editor top bar label', () => {
      render(<App />);
      const topBar = screen.getByRole('banner');
      expect(topBar).toBeTruthy();
      expect(topBar.getAttribute('aria-label')).toBe('Editor top bar');
    });

    it('renders a save status badge with aria-live="polite"', () => {
      render(<App />);
      const badge = document.querySelector('[aria-live="polite"]');
      expect(badge).toBeTruthy();
    });

    it('renders a History toggle button', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: 'Toggle version history' })).toBeTruthy();
    });

    it('does not show VersionHistoryPanel by default', () => {
      render(<App />);
      expect(screen.queryByTestId('version-history-panel')).toBeNull();
    });

    it('shows VersionHistoryPanel after clicking the History button', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Toggle version history' }));
      expect(screen.getByTestId('version-history-panel')).toBeTruthy();
    });

    it('hides VersionHistoryPanel after a second click on the History button', () => {
      render(<App />);
      const historyBtn = screen.getByRole('button', { name: 'Toggle version history' });
      fireEvent.click(historyBtn);
      fireEvent.click(historyBtn);
      expect(screen.queryByTestId('version-history-panel')).toBeNull();
    });

    it('shows "Not yet saved" on fresh load before any edits (hasEverEdited false)', () => {
      mockUseAutosave.mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false });
      render(<App />);
      expect(screen.getByText('Not yet saved')).toBeTruthy();
    });

    it('shows "Unsaved changes" after the first edit (hasEverEdited true)', () => {
      mockUseAutosave.mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: true });
      render(<App />);
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
    });

    it('renders an Export button in the top bar', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: 'Export video' })).toBeTruthy();
    });

    it('does not show ExportModal by default', () => {
      render(<App />);
      expect(screen.queryByTestId('export-modal')).toBeNull();
    });

    it('shows ExportModal after clicking the Export button', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
      expect(screen.getByTestId('export-modal')).toBeTruthy();
    });

    it('hides ExportModal after a second click on the Export button', () => {
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      fireEvent.click(exportBtn);
      fireEvent.click(exportBtn);
      expect(screen.queryByTestId('export-modal')).toBeNull();
    });

    it('Export button has aria-disabled="false" when currentVersionId is non-null', () => {
      vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(7);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('false');
    });

    it('Export button has aria-disabled="true" when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(null);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('true');
    });

    it('clicking Export button does not open ExportModal when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(null);
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
      expect(screen.queryByTestId('export-modal')).toBeNull();
    });

    it('Export button shows tooltip when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.useCurrentVersionId).mockReturnValue(null);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('title')).toBe('Save your project first to export.');
    });

    // ── Renders queue button + modal ─────────────────────────────────────────

    it('renders a "View renders queue" button in the top bar', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: 'View renders queue' })).toBeTruthy();
    });

    it('does not show RendersQueueModal by default', () => {
      render(<App />);
      expect(screen.queryByTestId('renders-queue-modal')).toBeNull();
    });

    it('shows RendersQueueModal after clicking the Renders button', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'View renders queue' }));
      expect(screen.getByTestId('renders-queue-modal')).toBeTruthy();
    });

    it('hides RendersQueueModal after a second click on the Renders button', () => {
      render(<App />);
      const rendersBtn = screen.getByRole('button', { name: 'View renders queue' });
      fireEvent.click(rendersBtn);
      fireEvent.click(rendersBtn);
      expect(screen.queryByTestId('renders-queue-modal')).toBeNull();
    });
  });
});

