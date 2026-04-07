import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ImageClipEditorPanel } from './ImageClipEditorPanel.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetStartFrame = vi.fn();
const mockSetDurationFrames = vi.fn();
const mockSetOpacity = vi.fn();

vi.mock('@/features/timeline/hooks/useImageClipEditor.js', () => ({
  useImageClipEditor: () => ({
    setStartFrame: mockSetStartFrame,
    setDurationFrames: mockSetDurationFrames,
    setOpacity: mockSetOpacity,
  }),
}));

vi.mock('@/store/project-store.js', () => ({
  useProjectStore: () => ({ fps: 30 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageClip(overrides: Partial<{
  id: string;
  startFrame: number;
  durationFrames: number;
  opacity: number;
}> = {}) {
  return {
    id: 'clip-1',
    type: 'image' as const,
    assetId: 'asset-1',
    trackId: 'track-1',
    startFrame: 0,
    durationFrames: 150,
    opacity: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImageClipEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('render', () => {
    it('should render the panel with "Image" heading', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.getByRole('heading', { name: 'Image' })).toBeDefined();
    });

    it('should render with accessible region label', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.getByRole('region', { name: 'Image clip editor' })).toBeDefined();
    });

    it('should render start frame input with correct initial value', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ startFrame: 30 })} />);
      const input = screen.getByLabelText('Start frame') as HTMLInputElement;
      expect(input.value).toBe('30');
    });

    it('should render duration input as seconds (150 frames / 30 fps = 5s)', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ durationFrames: 150 })} />);
      const input = screen.getByLabelText('Duration in seconds') as HTMLInputElement;
      expect(parseFloat(input.value)).toBe(5);
    });

    it('should render opacity input as percentage (1.0 → 100)', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ opacity: 1 })} />);
      const input = screen.getByLabelText('Opacity percentage') as HTMLInputElement;
      expect(input.value).toBe('100');
    });

    it('should render opacity percentage for fractional value (0.5 → 50)', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ opacity: 0.5 })} />);
      const input = screen.getByLabelText('Opacity percentage') as HTMLInputElement;
      expect(input.value).toBe('50');
    });

    it('should render frame count hint below duration input', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ durationFrames: 150 })} />);
      expect(screen.getByText(/150 frames @ 30 fps/)).toBeDefined();
    });
  });

  describe('close button', () => {
    it('should not render close button when onClose is not provided', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.queryByRole('button', { name: 'Close image clip editor' })).toBeNull();
    });

    it('should render close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<ImageClipEditorPanel clip={makeImageClip()} onClose={onClose} />);
      expect(screen.getByRole('button', { name: 'Close image clip editor' })).toBeDefined();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<ImageClipEditorPanel clip={makeImageClip()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close image clip editor' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('interactions — start frame', () => {
    it('should call setStartFrame with the new value when start frame input changes', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ startFrame: 0 })} />);
      fireEvent.change(screen.getByLabelText('Start frame'), { target: { value: '60' } });
      expect(mockSetStartFrame).toHaveBeenCalledWith(60);
    });
  });

  describe('interactions — duration', () => {
    it('should call setDurationFrames with frames converted from seconds', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ durationFrames: 150 })} />);
      // 3 seconds × 30 fps = 90 frames
      fireEvent.change(screen.getByLabelText('Duration in seconds'), { target: { value: '3' } });
      expect(mockSetDurationFrames).toHaveBeenCalledWith(90);
    });

    it('should not call setDurationFrames for non-numeric input', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      fireEvent.change(screen.getByLabelText('Duration in seconds'), { target: { value: 'abc' } });
      expect(mockSetDurationFrames).not.toHaveBeenCalled();
    });

    it('should not call setDurationFrames when value is 0 or negative', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      fireEvent.change(screen.getByLabelText('Duration in seconds'), { target: { value: '0' } });
      expect(mockSetDurationFrames).not.toHaveBeenCalled();
    });
  });

  describe('interactions — opacity', () => {
    it('should call setOpacity with value converted from percentage to fraction', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '75' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(0.75);
    });

    it('should clamp opacity above 100% to 1.0', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '150' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(1);
    });

    it('should clamp opacity below 0% to 0.0', () => {
      render(<ImageClipEditorPanel clip={makeImageClip({ opacity: 1 })} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: '-10' } });
      expect(mockSetOpacity).toHaveBeenCalledWith(0);
    });

    it('should not call setOpacity for non-numeric input', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      fireEvent.change(screen.getByLabelText('Opacity percentage'), { target: { value: 'xyz' } });
      expect(mockSetOpacity).not.toHaveBeenCalled();
    });
  });

  describe('label text', () => {
    it('should render START FRAME label', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.getByText('START FRAME')).toBeDefined();
    });

    it('should render DURATION (SECONDS) label', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.getByText('DURATION (SECONDS)')).toBeDefined();
    });

    it('should render OPACITY (%) label', () => {
      render(<ImageClipEditorPanel clip={makeImageClip()} />);
      expect(screen.getByText('OPACITY (%)')).toBeDefined();
    });
  });
});
