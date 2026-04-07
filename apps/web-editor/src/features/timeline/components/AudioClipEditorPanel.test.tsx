import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioClipEditorPanel } from './AudioClipEditorPanel.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetStartFrame = vi.fn();
const mockSetEndFrame = vi.fn();
const mockSetTrimInSeconds = vi.fn();
const mockSetVolume = vi.fn();

vi.mock('@/features/timeline/hooks/useAudioClipEditor.js', () => ({
  useAudioClipEditor: () => ({
    setStartFrame: mockSetStartFrame,
    setEndFrame: mockSetEndFrame,
    setTrimInSeconds: mockSetTrimInSeconds,
    setVolume: mockSetVolume,
  }),
}));

vi.mock('@/store/project-store.js', () => ({
  useProjectStore: () => ({ fps: 30 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudioClip(overrides: Partial<{
  id: string;
  startFrame: number;
  durationFrames: number;
  trimInFrame: number;
  volume: number;
}> = {}) {
  return {
    id: 'clip-1',
    type: 'audio' as const,
    assetId: 'asset-1',
    trackId: 'track-1',
    startFrame: 0,
    durationFrames: 150,
    trimInFrame: 0,
    volume: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioClipEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('render', () => {
    it('should render the panel with "Audio" heading', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByRole('heading', { name: 'Audio' })).toBeDefined();
    });

    it('should render with accessible region label', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByRole('region', { name: 'Audio clip editor' })).toBeDefined();
    });

    it('should render start frame input with correct initial value', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ startFrame: 30 })} />);
      const input = screen.getByLabelText('Start frame') as HTMLInputElement;
      expect(input.value).toBe('30');
    });

    it('should render end frame input as startFrame + durationFrames', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ startFrame: 30, durationFrames: 90 })} />);
      const input = screen.getByLabelText('End frame') as HTMLInputElement;
      expect(input.value).toBe('120');
    });

    it('should render trim-in input in seconds (0 frames = 0s)', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ trimInFrame: 0 })} />);
      const input = screen.getByLabelText('Start at second') as HTMLInputElement;
      expect(parseFloat(input.value)).toBe(0);
    });

    it('should render trim-in input converted from frames to seconds (60 frames / 30fps = 2s)', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ trimInFrame: 60 })} />);
      const input = screen.getByLabelText('Start at second') as HTMLInputElement;
      expect(parseFloat(input.value)).toBe(2);
    });

    it('should render volume input as percentage (1.0 → 100)', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ volume: 1 })} />);
      const input = screen.getByLabelText('Volume percentage') as HTMLInputElement;
      expect(input.value).toBe('100');
    });

    it('should render the frame hint with trimInFrame info', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ trimInFrame: 60 })} />);
      expect(screen.getByText(/60 frames @ 30 fps/)).toBeDefined();
    });
  });

  describe('close button', () => {
    it('should not render close button when onClose is not provided', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.queryByRole('button', { name: 'Close audio clip editor' })).toBeNull();
    });

    it('should render close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<AudioClipEditorPanel clip={makeAudioClip()} onClose={onClose} />);
      expect(screen.getByRole('button', { name: 'Close audio clip editor' })).toBeDefined();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<AudioClipEditorPanel clip={makeAudioClip()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close audio clip editor' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('interactions — start frame', () => {
    it('should call setStartFrame with the new value', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ startFrame: 0 })} />);
      fireEvent.change(screen.getByLabelText('Start frame'), { target: { value: '60' } });
      expect(mockSetStartFrame).toHaveBeenCalledWith(60);
    });
  });

  describe('interactions — end frame', () => {
    it('should call setEndFrame with the new value', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ startFrame: 0, durationFrames: 150 })} />);
      fireEvent.change(screen.getByLabelText('End frame'), { target: { value: '200' } });
      expect(mockSetEndFrame).toHaveBeenCalledWith(200);
    });
  });

  describe('interactions — start at second', () => {
    it('should call setTrimInSeconds with the new value', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ trimInFrame: 0 })} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: '2.5' } });
      expect(mockSetTrimInSeconds).toHaveBeenCalledWith(2.5);
    });

    it('should not call setTrimInSeconds for non-numeric input', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: 'abc' } });
      expect(mockSetTrimInSeconds).not.toHaveBeenCalled();
    });

    it('should not call setTrimInSeconds for negative values', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      fireEvent.change(screen.getByLabelText('Start at second'), { target: { value: '-1' } });
      expect(mockSetTrimInSeconds).not.toHaveBeenCalled();
    });
  });

  describe('interactions — volume', () => {
    it('should call setVolume with value converted from percentage to fraction', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '50' } });
      expect(mockSetVolume).toHaveBeenCalledWith(0.5);
    });

    it('should clamp volume above 100% to 1.0', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '120' } });
      expect(mockSetVolume).toHaveBeenCalledWith(1);
    });

    it('should clamp volume below 0% to 0.0', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip({ volume: 1 })} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: '-5' } });
      expect(mockSetVolume).toHaveBeenCalledWith(0);
    });

    it('should not call setVolume for non-numeric input', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      fireEvent.change(screen.getByLabelText('Volume percentage'), { target: { value: 'abc' } });
      expect(mockSetVolume).not.toHaveBeenCalled();
    });
  });

  describe('label text', () => {
    it('should render START FRAME label', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByText('START FRAME')).toBeDefined();
    });

    it('should render END FRAME label', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByText('END FRAME')).toBeDefined();
    });

    it('should render START AT SECOND label', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByText('START AT SECOND')).toBeDefined();
    });

    it('should render VOLUME (%) label', () => {
      render(<AudioClipEditorPanel clip={makeAudioClip()} />);
      expect(screen.getByText('VOLUME (%)')).toBeDefined();
    });
  });
});
