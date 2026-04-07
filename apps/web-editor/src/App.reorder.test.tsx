import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

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

// Captured prop references — set during render, used by handler tests
let capturedOnReorderTracks: ((ids: string[]) => void) | undefined;
let capturedOnDeleteTrack: ((trackId: string) => void) | undefined;

vi.mock('@/features/timeline/components/TimelinePanel', () => ({
  TimelinePanel: (props: { onReorderTracks?: (ids: string[]) => void; onDeleteTrack?: (trackId: string) => void }) => {
    capturedOnReorderTracks = props.onReorderTracks;
    capturedOnDeleteTrack = props.onDeleteTrack;
    return React.createElement('div', { 'data-testid': 'timeline-panel' });
  },
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

import * as ephemeralStoreModule from '@/store/ephemeral-store';
import * as projectStoreModule from '@/store/project-store';
import * as autosaveModule from '@/features/version-history/hooks/useAutosave';
import * as useProjectInitModule from '@/features/project/hooks/useProjectInit';
import { App } from './App.js';
import { makeProjectDoc, makeVideoClip } from './App.fixtures';

const TEST_PROJECT_ID = 'test-project-app-001';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);
const mockUseAutosave = vi.mocked(autosaveModule.useAutosave);
const mockUseProjectInit = vi.mocked(useProjectInitModule.useProjectInit);

// ---------------------------------------------------------------------------
// handleReorderTracks
// ---------------------------------------------------------------------------

describe('handleReorderTracks', () => {
  const track1 = { id: 'track-1', type: 'video' as const, name: 'Video', muted: false, locked: false };
  const track2 = { id: 'track-2', type: 'audio' as const, name: 'Audio', muted: false, locked: false };
  const track3 = { id: 'track-3', type: 'video' as const, name: 'Video 2', muted: false, locked: false };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnReorderTracks = undefined;
    mockUseProjectInit.mockReturnValue({ status: 'ready', projectId: TEST_PROJECT_ID });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseAutosave.mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false });
  });

  it('reorders tracks and calls setProject with tracks in the new order', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2, track3] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2, track3] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    expect(capturedOnReorderTracks).toBeDefined();

    capturedOnReorderTracks!(['track-3', 'track-1', 'track-2']);

    const setProjectCalls = vi.mocked(projectStoreModule.setProject).mock.calls;
    const lastCall = setProjectCalls[setProjectCalls.length - 1]?.[0];
    expect(lastCall?.tracks).toEqual([track3, track1, track2]);
  });

  it('preserves full track objects when reordering (not just ids)', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnReorderTracks!(['track-2', 'track-1']);

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks[0]).toEqual(track2);
    expect(lastCall?.tracks[1]).toEqual(track1);
  });

  it('filters out unknown track ids silently', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnReorderTracks!(['track-2', 'track-999', 'track-1']);

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks).toEqual([track2, track1]);
  });

  it('produces a single-track result when called with one id', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnReorderTracks!(['track-1']);

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks).toEqual([track1]);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteTrack
// ---------------------------------------------------------------------------

describe('handleDeleteTrack', () => {
  const track1 = { id: 'track-1', type: 'video' as const, name: 'Video', muted: false, locked: false };
  const track2 = { id: 'track-2', type: 'audio' as const, name: 'Audio', muted: false, locked: false };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDeleteTrack = undefined;
    mockUseProjectInit.mockReturnValue({ status: 'ready', projectId: TEST_PROJECT_ID });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseAutosave.mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false });
  });

  it('passes onDeleteTrack prop to TimelinePanel', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    expect(capturedOnDeleteTrack).toBeDefined();
  });

  it('removes the deleted track from the project', () => {
    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc(), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnDeleteTrack!('track-1');

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks).toEqual([track2]);
  });

  it('removes all clips that belong to the deleted track', () => {
    const clip1 = makeVideoClip({ id: 'clip-1', trackId: 'track-1' });
    const clip2 = makeVideoClip({ id: 'clip-2', trackId: 'track-2' });
    const clip3 = makeVideoClip({ id: 'clip-3', trackId: 'track-1' });

    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc([clip1, clip2, clip3]), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc([clip1, clip2, clip3]), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnDeleteTrack!('track-1');

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.clips).toEqual([clip2]);
  });

  it('preserves clips belonging to other tracks when deleting a track', () => {
    const clip1 = makeVideoClip({ id: 'clip-1', trackId: 'track-1' });
    const clip2 = makeVideoClip({ id: 'clip-2', trackId: 'track-2' });

    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc([clip1, clip2]), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc([clip1, clip2]), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnDeleteTrack!('track-1');

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.clips).toEqual([clip2]);
    expect(lastCall?.tracks).toEqual([track2]);
  });

  it('deleting a track with no clips still removes the track and leaves clips untouched', () => {
    const clip2 = makeVideoClip({ id: 'clip-2', trackId: 'track-2' });

    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc([clip2]), tracks: [track1, track2] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc([clip2]), tracks: [track1, track2] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnDeleteTrack!('track-1');

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks).toEqual([track2]);
    expect(lastCall?.clips).toEqual([clip2]);
  });

  it('calling with a non-existent track id does not alter tracks or clips', () => {
    const clip1 = makeVideoClip({ id: 'clip-1', trackId: 'track-1' });

    vi.mocked(projectStoreModule.useProjectStore).mockReturnValue(
      { ...makeProjectDoc([clip1]), tracks: [track1] } as ReturnType<typeof mockUseProjectStore>,
    );
    vi.mocked(projectStoreModule.getSnapshot).mockReturnValue(
      { ...makeProjectDoc([clip1]), tracks: [track1] } as ReturnType<typeof projectStoreModule.getSnapshot>,
    );

    render(<App />);
    capturedOnDeleteTrack!('track-999');

    const lastCall = vi.mocked(projectStoreModule.setProject).mock.lastCall?.[0];
    expect(lastCall?.tracks).toEqual([track1]);
    expect(lastCall?.clips).toEqual([clip1]);
  });
});
