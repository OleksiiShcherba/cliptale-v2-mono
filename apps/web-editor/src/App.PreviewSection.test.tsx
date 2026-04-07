import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/preview/components/PreviewPanel', () => ({
  PreviewPanel: () => React.createElement('div', { 'data-testid': 'preview-panel' }),
}));

vi.mock('@/features/preview/components/PlaybackControls', () => ({
  PlaybackControls: () => React.createElement('div', { 'data-testid': 'playback-controls' }),
}));

vi.mock('@/features/preview/hooks/useRemotionPlayer', () => ({
  useRemotionPlayer: vi.fn(() => ({ playerRef: { current: null } })),
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
  getCurrentVersionId: vi.fn().mockReturnValue(null),
  useCurrentVersionId: vi.fn().mockReturnValue(null),
  setCurrentVersionId: vi.fn(),
}));

vi.mock('@/features/captions/components/CaptionEditorPanel', () => ({
  CaptionEditorPanel: () => React.createElement('div', { 'data-testid': 'caption-editor-panel' }),
}));

vi.mock('@/features/timeline/components/ImageClipEditorPanel', () => ({
  ImageClipEditorPanel: () => React.createElement('div', { 'data-testid': 'image-clip-editor-panel' }),
}));

import * as useRemotionPlayerModule from '@/features/preview/hooks/useRemotionPlayer';
import * as ephemeralStoreModule from '@/store/ephemeral-store';
import { PreviewSection } from './App.js';

const mockUseRemotionPlayer = vi.mocked(useRemotionPlayerModule.useRemotionPlayer);
const mockUseEphemeralStore = vi.mocked(ephemeralStoreModule.useEphemeralStore);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockUseRemotionPlayer.mockReturnValue({ playerRef: { current: null } });
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
