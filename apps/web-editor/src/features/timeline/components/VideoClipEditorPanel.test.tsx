import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { VideoClipEditorPanel } from './VideoClipEditorPanel.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetStartFrame = vi.fn();
const mockSetEndFrame = vi.fn();
const mockSetTrimInSeconds = vi.fn();
const mockSetOpacity = vi.fn();
const mockSetVolume = vi.fn();

vi.mock('@/features/timeline/hooks/useVideoClipEditor.js', () => ({
  useVideoClipEditor: () => ({
    setStartFrame: mockSetStartFrame,
    setEndFrame: mockSetEndFrame,
    setTrimInSeconds: mockSetTrimInSeconds,
    setOpacity: mockSetOpacity,
    setVolume: mockSetVolume,
  }),
}));

vi.mock('@/store/project-store.js', () => ({
  useProjectStore: () => ({ fps: 30 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVideoClip(overrides: Partial<{
  id: string;
  startFrame: number;
  durationFrames: number;
  trimInFrame: number;
  opacity: number;
  volume: number;
}> = {}) {
  return {
    id: 'clip-1',
    type: 'video' as const,
    assetId: 'asset-1',
    trackId: 'track-1',
    startFrame: 0,
    durationFrames: 150,
    trimInFrame: 0,
    opacity: 1,
    volume: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoClipEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('render', () => {
    it('should render the panel with "Video" heading', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByRole('heading', { name: 'Video' })).toBeDefined();
    });

    it('should render with accessible region label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByRole('region', { name: 'Video clip editor' })).toBeDefined();
    });

    it('should render start frame input with correct initial value', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ startFrame: 30 })} />);
      const input = screen.getByLabelText('Start frame') as HTMLInputElement;
      expect(input.value).toBe('30');
    });

    it('should render end frame input as startFrame + durationFrames', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ startFrame: 30, durationFrames: 90 })} />);
      const input = screen.getByLabelText('End frame') as HTMLInputElement;
      expect(input.value).toBe('120');
    });

    it('should render trim-in input in seconds (0 frames = 0s)', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ trimInFrame: 0 })} />);
      const input = screen.getByLabelText('Start at second') as HTMLInputElement;
      expect(parseFloat(input.value)).toBe(0);
    });

    it('should render trim-in input converted from frames to seconds (60 frames / 30fps = 2s)', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ trimInFrame: 60 })} />);
      const input = screen.getByLabelText('Start at second') as HTMLInputElement;
      expect(parseFloat(input.value)).toBe(2);
    });

    it('should render opacity input as percentage (1.0 → 100)', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ opacity: 1 })} />);
      const input = screen.getByLabelText('Opacity percentage') as HTMLInputElement;
      expect(input.value).toBe('100');
    });

    it('should render volume input as percentage (1.0 → 100)', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ volume: 1 })} />);
      const input = screen.getByLabelText('Volume percentage') as HTMLInputElement;
      expect(input.value).toBe('100');
    });

    it('should render the frame hint with trimInFrame info', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ trimInFrame: 60 })} />);
      expect(screen.getByText(/60 frames @ 30 fps/)).toBeDefined();
    });
  });

  describe('close button', () => {
    it('should not render close button when onClose is not provided', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.queryByRole('button', { name: 'Close video clip editor' })).toBeNull();
    });

    it('should render close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<VideoClipEditorPanel clip={makeVideoClip()} onClose={onClose} />);
      expect(screen.getByRole('button', { name: 'Close video clip editor' })).toBeDefined();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<VideoClipEditorPanel clip={makeVideoClip()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close video clip editor' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('interactions — start frame', () => {
    it('should call setStartFrame with the new value', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ startFrame: 0 })} />);
      fireEvent.change(screen.getByLabelText('Start frame'), { target: { value: '60' } });
      expect(mockSetStartFrame).toHaveBeenCalledWith(60);
    });
  });

  describe('interactions — end frame', () => {
    it('should call setEndFrame with the new value', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ startFrame: 0, durationFrames: 150 })} />);
      fireEvent.change(screen.getByLabelText('End frame'), { target: { value: '200' } });
      expect(mockSetEndFrame).toHaveBeenCalledWith(200);
    });
  });

  describe('interactions — start at second', () => {
    it('should call setTrimInSeconds with the new value', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ trimInFrame: 0 })} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: '2.5' } });
      expect(mockSetTrimInSeconds).toHaveBeenCalledWith(2.5);
    });

    it('should not call setTrimInSeconds for non-numeric input', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: 'abc' } });
      expect(mockSetTrimInSeconds).not.toHaveBeenCalled();
    });

    it('should not call setTrimInSeconds for negative values', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: '-1' } });
      expect(mockSetTrimInSeconds).not.toHaveBeenCalled();
    });
  });

  describe('interactions — opacity', () => {
    it('should call setOpacity with value converted from percentage to fraction', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '75' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(0.75);
    });

    it('should clamp opacity above 100% to 1.0', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '150' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(1);
    });

    it('should clamp opacity below 0% to 0.0', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '-10' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(0);
    });

    it('should not call setOpacity for non-numeric input', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: 'xyz' } });
      expect(mockSetOpacity).not.toHaveBeenCalled();
    });
  });

  describe('interactions — volume', () => {
    it('should call setVolume with value converted from percentage to fraction', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '50' } });
      expect(mockSetVolume).toHaveBeenCalledWith(0.5);
    });

    it('should clamp volume above 100% to 1.0', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '120' } });
      expect(mockSetVolume).toHaveBeenCalledWith(1);
    });

    it('should clamp volume below 0% to 0.0', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '-5' } });
      expect(mockSetVolume).toHaveBeenCalledWith(0);
    });

    it('should not call setVolume for non-numeric input', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: 'abc' } });
      expect(mockSetVolume).not.toHaveBeenCalled();
    });
  });

  describe('label text', () => {
    it('should render START FRAME label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByText('START FRAME')).toBeDefined();
    });

    it('should render END FRAME label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByText('END FRAME')).toBeDefined();
    });

    it('should render START AT SECOND label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByText('START AT SECOND')).toBeDefined();
    });

    it('should render OPACITY (%) label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByText('OPACITY (%)')).toBeDefined();
    });

    it('should render VOLUME (%) label', () => {
      render(<VideoClipEditorPanel clip={makeVideoClip()} />);
      expect(screen.getByText('VOLUME (%)')).toBeDefined();
    });
  });
});
