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

vi.mock('@/shared/ai-generation/components/AiGenerationPanel', () => ({
  AiGenerationPanel: ({ context }: { context: { kind: string; id: string } }) =>
    React.createElement('div', {
      'data-testid': 'ai-generation-panel',
      'data-context-kind': context.kind,
      'data-context-id': context.id,
    }),
}));

vi.mock('@/shared/ai-generation/components/LeftSidebarTabs', async () => {
  const actual = await vi.importActual('@/shared/ai-generation/components/LeftSidebarTabs');
  return actual;
});

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
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

import * as ephemeralStoreModule from '@/store/ephemeral-store';
import * as projectStoreModule from '@/store/project-store';
import * as useProjectInitModule from '@/features/project/hooks/useProjectInit';
import { App } from './App.js';
import { makeProjectDoc } from './App.fixtures';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);
const mockUseProjectInit = vi.mocked(useProjectInitModule.useProjectInit);

describe('App left sidebar tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectInit.mockReturnValue({ status: 'ready', projectId: 'proj-1' });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
    } as ReturnType<typeof ephemeralStoreModule.useEphemeralStore>);
    mockUseProjectStore.mockReturnValue(makeProjectDoc() as ReturnType<typeof projectStoreModule.useProjectStore>);
  });

  it('renders LeftSidebarTabs in the left sidebar', () => {
    render(<App />);
    expect(screen.getByRole('tablist', { name: 'Left sidebar tabs' })).toBeTruthy();
  });

  it('shows AssetBrowserPanel by default (assets tab active)', () => {
    render(<App />);
    expect(screen.getByTestId('asset-browser-panel')).toBeTruthy();
    expect(screen.queryByTestId('ai-generation-panel')).toBeNull();
  });

  it('shows AiGenerationPanel when AI Generate tab is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Generate' }));
    expect(screen.getByTestId('ai-generation-panel')).toBeTruthy();
    expect(screen.queryByTestId('asset-browser-panel')).toBeNull();
  });

  it('switches back to AssetBrowserPanel when Assets tab is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Generate' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    expect(screen.getByTestId('asset-browser-panel')).toBeTruthy();
    expect(screen.queryByTestId('ai-generation-panel')).toBeNull();
  });

  it('passes project context to AiGenerationPanel', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Generate' }));
    const panel = screen.getByTestId('ai-generation-panel');
    expect(panel.getAttribute('data-context-kind')).toBe('project');
    expect(panel.getAttribute('data-context-id')).toBe('proj-1');
  });
});
