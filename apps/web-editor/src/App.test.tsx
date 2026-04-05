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
  CaptionEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'caption-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  useProjectStore: vi.fn(),
  getSnapshot: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  setProject: vi.fn(),
  getCurrentVersionId: vi.fn().mockReturnValue(7),
  setCurrentVersionId: vi.fn(),
}));

vi.mock('@/store/history-store', () => ({
  drainPatches: vi.fn().mockReturnValue({ patches: [], inversePatches: [] }),
  hasPendingPatches: vi.fn().mockReturnValue(false),
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

vi.mock('@/features/timeline/components/TimelinePanel', () => ({
  TimelinePanel: () => React.createElement('div', { 'data-testid': 'timeline-panel' }),
}));

import * as ephemeralStoreModule from '@/store/ephemeral-store';
import * as projectStoreModule from '@/store/project-store';
import * as autosaveModule from '@/features/version-history/hooks/useAutosave';
import * as useRemotionPlayerModule from '@/features/preview/hooks/useRemotionPlayer';
import { App, PreviewSection, DEV_PROJECT_ID } from './App.js';
import { makeProjectDoc } from './App.fixtures';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);
const mockUseAutosave = vi.mocked(autosaveModule.useAutosave);
const mockUseRemotionPlayer = vi.mocked(useRemotionPlayerModule.useRemotionPlayer);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const sidebar = screen.getByRole('complementary', { name: 'Asset browser' });
      expect(sidebar).toBeTruthy();
      expect(sidebar.querySelector('[data-testid="asset-browser-panel"]')).toBeTruthy();
    });

    it('passes DEV_PROJECT_ID to AssetBrowserPanel', () => {
      render(<App />);
      const panel = screen.getByTestId('asset-browser-panel');
      expect(panel.getAttribute('data-project-id')).toBe(DEV_PROJECT_ID);
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
      const sidebar = screen.getByRole('complementary', { name: 'Asset browser' });
      expect(sidebar).toBeTruthy();
    });
  });

  describe('vertical divider', () => {
    it('renders a decorative divider element between sidebar and main', () => {
      const { container } = render(<App />);
      const shell = container.firstChild as HTMLElement;
      const shellChildren = Array.from(shell.children);
      // Shell has: TopBar + editor row + TimelinePanel = 3 children
      expect(shellChildren.length).toBe(3);
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
      vi.mocked(projectStoreModule.getCurrentVersionId).mockReturnValue(7);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('false');
    });

    it('Export button has aria-disabled="true" when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.getCurrentVersionId).mockReturnValue(null);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('true');
    });

    it('clicking Export button does not open ExportModal when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.getCurrentVersionId).mockReturnValue(null);
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
      expect(screen.queryByTestId('export-modal')).toBeNull();
    });

    it('Export button shows tooltip when currentVersionId is null', () => {
      vi.mocked(projectStoreModule.getCurrentVersionId).mockReturnValue(null);
      render(<App />);
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('title')).toBe('Save your project first to export.');
    });
  });
});

describe('PreviewSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default useRemotionPlayer return value so Bug 3 tests don't
    // pollute the simple render assertions above.
    mockUseRemotionPlayer.mockReturnValue({ playerRef: { current: null } });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
  });

  it('renders PreviewPanel', () => {
    render(<PreviewSection />);
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  it('renders PlaybackControls', () => {
    render(<PreviewSection />);
    expect(screen.getByTestId('playback-controls')).toBeTruthy();
  });

  it('renders PreviewPanel before PlaybackControls in DOM order', () => {
    const { container } = render(<PreviewSection />);
    const section = container.firstChild as HTMLElement;
    const children = Array.from(section.children);
    expect(children[0]?.querySelector('[data-testid="preview-panel"]')).toBeTruthy();
    expect(children[1]?.getAttribute('data-testid')).toBe('playback-controls');
  });

  // ---------------------------------------------------------------------------
  // Bug 3 — ruler click seeks Remotion player (useEffect on playheadFrame)
  // ---------------------------------------------------------------------------

  it('calls player.seekTo with playheadFrame when playheadFrame changes and player is not playing (Bug 3)', () => {
    const seekTo = vi.fn();
    const mockPlayer = { seekTo, isPlaying: () => false };

    mockUseRemotionPlayer.mockReturnValue({
      playerRef: { current: mockPlayer } as unknown as React.RefObject<import('@remotion/player').PlayerRef | null>,
    });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    const { rerender } = render(<PreviewSection />);
    seekTo.mockClear();

    // Simulate a playheadFrame change (e.g. ruler click) while not playing.
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 45,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    rerender(<PreviewSection />);

    expect(seekTo).toHaveBeenCalledWith(45);
  });

  it('does NOT call player.seekTo when player is currently playing (Bug 3)', () => {
    const seekTo = vi.fn();
    const mockPlayer = { seekTo, isPlaying: () => true };

    mockUseRemotionPlayer.mockReturnValue({
      playerRef: { current: mockPlayer } as unknown as React.RefObject<import('@remotion/player').PlayerRef | null>,
    });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    const { rerender } = render(<PreviewSection />);
    seekTo.mockClear();

    // Change playheadFrame but player is still playing — seekTo must NOT be called.
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 90,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    rerender(<PreviewSection />);

    expect(seekTo).not.toHaveBeenCalled();
  });

  it('does not throw when playerRef.current is null and playheadFrame changes (Bug 3)', () => {
    mockUseRemotionPlayer.mockReturnValue({
      playerRef: { current: null },
    });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    const { rerender } = render(<PreviewSection />);

    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 30,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    expect(() => rerender(<PreviewSection />)).not.toThrow();
  });
});

describe('PreviewPanel props', () => {
  it('accepts optional playerRef without crashing', () => {
    render(<PreviewSection />);
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });
});
