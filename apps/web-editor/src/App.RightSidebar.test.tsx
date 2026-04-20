import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/features/asset-manager/components/AssetBrowserPanel', () => ({
  AssetBrowserPanel: () => React.createElement('div', { 'data-testid': 'asset-browser-panel' }),
}));

vi.mock('@/features/preview/components/PreviewPanel', () => ({
  PreviewPanel: () => React.createElement('div', { 'data-testid': 'preview-panel' }),
}));

vi.mock('@/features/preview/components/PlaybackControls', () => ({
  PlaybackControls: () => React.createElement('div', { 'data-testid': 'playback-controls' }),
}));

vi.mock('@/features/preview/hooks/useRemotionPlayer', () => ({
  useRemotionPlayer: () => ({ playerRef: { current: null } }),
}));

vi.mock('@/features/captions/components/CaptionEditorPanel', () => ({
  CaptionEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'caption-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/features/timeline/components/ImageClipEditorPanel', () => ({
  ImageClipEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'image-clip-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/features/timeline/components/VideoClipEditorPanel', () => ({
  VideoClipEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'video-clip-editor-panel', 'data-clip-id': clip.id }),
}));

vi.mock('@/features/timeline/components/AudioClipEditorPanel', () => ({
  AudioClipEditorPanel: ({ clip }: { clip: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'audio-clip-editor-panel', 'data-clip-id': clip.id }),
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
  getCurrentVersionId: vi.fn().mockReturnValue(null),
  useCurrentVersionId: vi.fn().mockReturnValue(null),
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
    React.createElement('div', { 'data-testid': 'version-history-panel', onClick: onClose }),
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
  useProjectInit: vi.fn().mockReturnValue({ status: 'ready', projectId: 'test-project-001' }),
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

import { App } from './App.js';
import { CLIP_ID, makeTextOverlayClip, makeImageClip, makeVideoClip, makeAudioClip, makeCaptionClip, makeProjectDoc } from './App.fixtures';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);

// Shared ephemeral state for single-clip selection tests.
const makeSingleSelectState = (clipId: string) => ({
  selectedClipIds: [clipId],
  playheadFrame: 0,
  zoom: 1,
  pxPerFrame: 4,
  scrollOffsetX: 0,
});

// ---------------------------------------------------------------------------
// Tests — RightSidebar (conditional inspector)
// ---------------------------------------------------------------------------

describe('RightSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc() as ReturnType<typeof mockUseProjectStore>,
    );
  });

  it('does not render the inspector when no clips are selected', () => {
    mockUseEphemeralStore.mockReturnValue({ selectedClipIds: [], playheadFrame: 0, zoom: 1, pxPerFrame: 4, scrollOffsetX: 0 });
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('does not render the inspector when more than one clip is selected', () => {
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID, '00000000-0000-0000-0000-000000000099'],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc([makeTextOverlayClip()]) as ReturnType<typeof mockUseProjectStore>,
    );
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('does not render the inspector when the selected clip id does not exist in the project', () => {
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: ['non-existent-id'],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  // --- video clip ---

  it('renders VideoClipEditorPanel in Inspector when a video clip is selected', () => {
    const clip = makeVideoClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByTestId('video-clip-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip id to VideoClipEditorPanel', () => {
    const clip = makeVideoClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByTestId('video-clip-editor-panel').getAttribute('data-clip-id')).toBe(CLIP_ID);
  });

  // --- audio clip ---

  it('renders AudioClipEditorPanel in Inspector when an audio clip is selected', () => {
    const clip = makeAudioClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByTestId('audio-clip-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip id to AudioClipEditorPanel', () => {
    const clip = makeAudioClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByTestId('audio-clip-editor-panel').getAttribute('data-clip-id')).toBe(CLIP_ID);
  });

  // --- image clip ---

  it('renders ImageClipEditorPanel in Inspector when an image clip is selected', () => {
    const clip = makeImageClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByTestId('image-clip-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip id to ImageClipEditorPanel', () => {
    const clip = makeImageClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByTestId('image-clip-editor-panel').getAttribute('data-clip-id')).toBe(CLIP_ID);
  });

  it('does not render CaptionEditorPanel when an image clip is selected', () => {
    const clip = makeImageClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  // --- text-overlay (caption) clip ---

  it('renders CaptionEditorPanel in Inspector when a text-overlay clip is selected', () => {
    const clip = makeTextOverlayClip();
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc([clip]) as ReturnType<typeof mockUseProjectStore>,
    );
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByTestId('caption-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip id to CaptionEditorPanel', () => {
    const clip = makeTextOverlayClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc([clip]) as ReturnType<typeof mockUseProjectStore>,
    );
    render(<App />);
    expect(screen.getByTestId('caption-editor-panel').getAttribute('data-clip-id')).toBe(CLIP_ID);
  });

  // --- caption clip ---

  it('renders CaptionEditorPanel in Inspector when a caption clip is selected', () => {
    const clip = makeCaptionClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByTestId('caption-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip id to CaptionEditorPanel when a caption clip is selected', () => {
    const clip = makeCaptionClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue(makeSingleSelectState(CLIP_ID));
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [clip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.getByTestId('caption-editor-panel').getAttribute('data-clip-id')).toBe(CLIP_ID);
  });
});
