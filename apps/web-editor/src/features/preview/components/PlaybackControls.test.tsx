import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlaybackControls } from './PlaybackControls.js';

// ---------------------------------------------------------------------------
// Mock usePlaybackControls so the component can be tested in isolation
// ---------------------------------------------------------------------------

vi.mock('@/features/preview/hooks/usePlaybackControls.js', () => ({
  usePlaybackControls: vi.fn(),
}));

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: () => ({ volume: 1, isMuted: false }),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock('./VolumeControl', () => ({
  VolumeControl: () => null,
}));

import * as playbackControlsModule from '@/features/preview/hooks/usePlaybackControls.js';

const mockUsePlaybackControls = vi.mocked(playbackControlsModule.usePlaybackControls);

function makeHookResult(overrides: Record<string, unknown> = {}) {
  return {
    isPlaying: false,
    currentFrame: 0,
    totalFrames: 300,
    timecode: '00:00:00:00',
    totalTimecode: '00:00:10:00',
    containerRef: { current: null },
    play: vi.fn(),
    pause: vi.fn(),
    rewind: vi.fn(),
    stepForward: vi.fn(),
    stepBack: vi.fn(),
    seekTo: vi.fn(),
    ...overrides,
  };
}

function makePlayerRef() {
  return { current: null } as React.RefObject<import('@remotion/player').PlayerRef | null>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePlaybackControls.mockReturnValue(makeHookResult() as ReturnType<typeof mockUsePlaybackControls>);
  });

  describe('renders', () => {
    it('renders without crashing', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('toolbar')).toBeDefined();
    });

    it('has accessible toolbar label', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('toolbar', { name: 'Playback controls' })).toBeDefined();
    });

    it('renders play button when not playing', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ isPlaying: false }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('button', { name: 'Play' })).toBeDefined();
    });

    it('renders pause button when playing', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ isPlaying: true }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();
    });

    it('renders rewind button', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('button', { name: 'Rewind to start' })).toBeDefined();
    });

    it('renders step back button', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('button', { name: 'Step back one frame' })).toBeDefined();
    });

    it('renders step forward button', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('button', { name: 'Step forward one frame' })).toBeDefined();
    });

    it('renders scrub slider', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByRole('slider', { name: 'Playback position' })).toBeDefined();
    });

    it('renders frame counter with currentFrame and totalFrames', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ currentFrame: 45, totalFrames: 300 }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByText('45 / 300')).toBeDefined();
    });

    it('renders timecode string', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ timecode: '00:00:01:15' }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      expect(screen.getByText('00:00:01:15')).toBeDefined();
    });

    it('sets slider max to totalFrames - 1', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ totalFrames: 120 }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      const slider = screen.getByRole('slider') as HTMLInputElement;
      expect(slider.max).toBe('119');
    });

    it('sets slider value to currentFrame', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ currentFrame: 60 }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      const slider = screen.getByRole('slider') as HTMLInputElement;
      expect(slider.value).toBe('60');
    });
  });

  describe('interactions', () => {
    it('calls play() when play button is clicked', () => {
      const hookResult = makeHookResult({ isPlaying: false });
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(hookResult.play).toHaveBeenCalledOnce();
    });

    it('calls pause() when pause button is clicked', () => {
      const hookResult = makeHookResult({ isPlaying: true });
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(hookResult.pause).toHaveBeenCalledOnce();
    });

    it('calls rewind() when rewind button is clicked', () => {
      const hookResult = makeHookResult();
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Rewind to start' }));
      expect(hookResult.rewind).toHaveBeenCalledOnce();
    });

    it('calls stepBack() when step back button is clicked', () => {
      const hookResult = makeHookResult();
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Step back one frame' }));
      expect(hookResult.stepBack).toHaveBeenCalledOnce();
    });

    it('calls stepForward() when step forward button is clicked', () => {
      const hookResult = makeHookResult();
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
      expect(hookResult.stepForward).toHaveBeenCalledOnce();
    });

    it('calls seekTo() with parsed value when slider changes', () => {
      const hookResult = makeHookResult({ totalFrames: 300 });
      mockUsePlaybackControls.mockReturnValue(hookResult as ReturnType<typeof mockUsePlaybackControls>);
      render(<PlaybackControls playerRef={makePlayerRef()} />);

      fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } });
      expect(hookResult.seekTo).toHaveBeenCalledWith(90);
    });
  });

  describe('styling', () => {
    it('applies surface-alt background to container', () => {
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      const toolbar = screen.getByRole('toolbar');
      // jsdom normalises hex colours to rgb() notation.
      expect(toolbar.style.background).toBe('rgb(22, 22, 31)');
    });

    it('applies primary accent to play button', () => {
      mockUsePlaybackControls.mockReturnValue(
        makeHookResult({ isPlaying: false }) as ReturnType<typeof mockUsePlaybackControls>,
      );
      render(<PlaybackControls playerRef={makePlayerRef()} />);
      const playBtn = screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement;
      // jsdom normalises hex colours to rgb() notation.
      expect(playBtn.style.background).toBe('rgb(124, 58, 237)');
    });
  });
});
