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

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  useProjectStore: vi.fn(),
  getSnapshot: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  setProject: vi.fn(),
  getCurrentVersionId: vi.fn().mockReturnValue(null),
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
    React.createElement('div', { 'data-testid': 'version-history-panel', onClick: onClose }),
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
import { App } from './App.js';
import { CLIP_ID, TRACK_ID, makeTextOverlayClip, makeProjectDoc } from './App.fixtures';

const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);
const mockUseProjectStore = vi.mocked(projectStoreModule.useProjectStore);

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

  it('does not render the inspector when the selected clip is not a text-overlay', () => {
    const videoClip = {
      id: CLIP_ID,
      type: 'video' as const,
      trackId: TRACK_ID,
      startFrame: 0,
      durationFrames: 30,
      assetId: 'asset-001',
      volume: 1,
    };
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseProjectStore.mockReturnValue({
      ...makeProjectDoc([]),
      clips: [videoClip],
    } as unknown as ReturnType<typeof mockUseProjectStore>);
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByTestId('caption-editor-panel')).toBeNull();
  });

  it('renders the inspector aside with CaptionEditorPanel when one text-overlay clip is selected', () => {
    const clip = makeTextOverlayClip();
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc([clip]) as ReturnType<typeof mockUseProjectStore>,
    );
    render(<App />);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector).toBeTruthy();
    expect(screen.getByTestId('caption-editor-panel')).toBeTruthy();
  });

  it('passes the correct clip to CaptionEditorPanel', () => {
    const clip = makeTextOverlayClip({ id: CLIP_ID });
    mockUseEphemeralStore.mockReturnValue({
      selectedClipIds: [CLIP_ID],
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });
    mockUseProjectStore.mockReturnValue(
      makeProjectDoc([clip]) as ReturnType<typeof mockUseProjectStore>,
    );
    render(<App />);
    const panel = screen.getByTestId('caption-editor-panel');
    expect(panel.getAttribute('data-clip-id')).toBe(CLIP_ID);
  });
});
