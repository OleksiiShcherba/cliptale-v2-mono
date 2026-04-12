import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => `${url}${url.includes('?') ? '&' : '?'}token=test`,
}));

vi.mock('@/features/timeline/components/WaveformSvg', () => ({
  WaveformSvg: ({ peaks, width, height }: { peaks: number[]; width: number; height: number }) =>
    React.createElement('svg', {
      'data-testid': 'waveform-svg',
      'data-peaks-length': peaks.length,
      'data-width': width,
      'data-height': height,
    }),
}));

import { AssetPreviewModal } from './AssetPreviewModal';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/clip.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 5_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dialog scaffolding', () => {
    it('renders with role="dialog" and aria-modal', () => {
      render(<AssetPreviewModal asset={makeAsset()} onClose={vi.fn()} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('labels the dialog with the asset filename heading', () => {
      render(<AssetPreviewModal asset={makeAsset({ filename: 'beach.mp4' })} onClose={vi.fn()} />);
      const heading = screen.getByRole('heading', { name: /beach\.mp4/i });
      expect(heading).toBeDefined();
      expect(heading.id).toBe('asset-preview-title');
      expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('asset-preview-title');
    });

    it('renders a close button', () => {
      render(<AssetPreviewModal asset={makeAsset()} onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /close asset preview/i })).toBeDefined();
    });
  });

  describe('content-type branching', () => {
    it('renders a <video> element for video/* assets', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'video/mp4' })}
          onClose={vi.fn()}
        />,
      );
      const video = screen.getByTestId('asset-preview-video') as HTMLVideoElement;
      expect(video).toBeDefined();
      expect(video.tagName).toBe('VIDEO');
      expect(video.hasAttribute('controls')).toBe(true);
      expect(screen.queryByTestId('asset-preview-audio')).toBeNull();
      expect(screen.queryByTestId('asset-preview-image')).toBeNull();
    });

    it('renders an <audio> element for audio/* assets', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'audio/mpeg', filename: 'song.mp3' })}
          onClose={vi.fn()}
        />,
      );
      const audio = screen.getByTestId('asset-preview-audio') as HTMLAudioElement;
      expect(audio).toBeDefined();
      expect(audio.tagName).toBe('AUDIO');
      expect(audio.hasAttribute('controls')).toBe(true);
      expect(screen.queryByTestId('asset-preview-video')).toBeNull();
      expect(screen.queryByTestId('asset-preview-image')).toBeNull();
    });

    it('shows WaveformSvg above the audio element when waveformPeaks is present', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({
            contentType: 'audio/wav',
            waveformPeaks: [0.1, 0.5, 0.3, 0.8, 0.2],
          })}
          onClose={vi.fn()}
        />,
      );
      const waveform = screen.getByTestId('waveform-svg');
      expect(waveform).toBeDefined();
      expect(waveform.getAttribute('data-peaks-length')).toBe('5');
      expect(waveform.getAttribute('data-width')).toBe('600');
      expect(waveform.getAttribute('data-height')).toBe('120');
    });

    it('omits WaveformSvg when waveformPeaks is null or empty', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'audio/wav', waveformPeaks: null })}
          onClose={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('waveform-svg')).toBeNull();
      expect(screen.getByText(/no waveform available/i)).toBeDefined();
    });

    it('renders an <img> element for image/* assets', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'image/png', filename: 'photo.png' })}
          onClose={vi.fn()}
        />,
      );
      const image = screen.getByTestId('asset-preview-image') as HTMLImageElement;
      expect(image).toBeDefined();
      expect(image.tagName).toBe('IMG');
      expect(image.getAttribute('alt')).toBe('Preview of photo.png');
      expect(screen.queryByTestId('asset-preview-video')).toBeNull();
      expect(screen.queryByTestId('asset-preview-audio')).toBeNull();
    });

    it('falls back to an informational message for unsupported types', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'application/pdf' })}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(/preview not supported/i)).toBeDefined();
      expect(screen.queryByTestId('asset-preview-video')).toBeNull();
      expect(screen.queryByTestId('asset-preview-audio')).toBeNull();
      expect(screen.queryByTestId('asset-preview-image')).toBeNull();
    });
  });

  describe('media src wiring', () => {
    it('passes an authenticated URL (with token query param) to the <video> src', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'video/mp4', downloadUrl: 'https://cdn.example/clip.mp4' })}
          onClose={vi.fn()}
        />,
      );
      const video = screen.getByTestId('asset-preview-video') as HTMLVideoElement;
      // buildAuthenticatedUrl mock appends ?token=test
      expect(video.getAttribute('src')).toBe('https://cdn.example/clip.mp4?token=test');
    });

    it('appends token to an existing query string in the <video> src', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'video/mp4', downloadUrl: 'https://cdn.example/clip.mp4?expires=123' })}
          onClose={vi.fn()}
        />,
      );
      const video = screen.getByTestId('asset-preview-video') as HTMLVideoElement;
      // buildAuthenticatedUrl mock appends &token=test when ? already present
      expect(video.getAttribute('src')).toBe('https://cdn.example/clip.mp4?expires=123&token=test');
    });

    it('passes an authenticated URL (with token query param) to the <audio> src', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'audio/mpeg', downloadUrl: 'https://cdn.example/song.mp3' })}
          onClose={vi.fn()}
        />,
      );
      const audio = screen.getByTestId('asset-preview-audio') as HTMLAudioElement;
      // buildAuthenticatedUrl mock appends ?token=test
      expect(audio.getAttribute('src')).toBe('https://cdn.example/song.mp3?token=test');
    });

    it('appends token to an existing query string in the <audio> src', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({ contentType: 'audio/mpeg', downloadUrl: 'https://cdn.example/song.mp3?expires=456' })}
          onClose={vi.fn()}
        />,
      );
      const audio = screen.getByTestId('asset-preview-audio') as HTMLAudioElement;
      // buildAuthenticatedUrl mock appends &token=test when ? already present
      expect(audio.getAttribute('src')).toBe('https://cdn.example/song.mp3?expires=456&token=test');
    });

    it('uses getAssetPreviewUrl for image assets (already authenticated via buildAuthenticatedUrl)', () => {
      render(
        <AssetPreviewModal
          asset={makeAsset({
            id: 'img-42',
            contentType: 'image/jpeg',
            status: 'ready',
          })}
          onClose={vi.fn()}
        />,
      );
      const image = screen.getByTestId('asset-preview-image') as HTMLImageElement;
      // getAssetPreviewUrl calls buildAuthenticatedUrl internally, so the stream
      // URL already has ?token=test appended by the mock
      expect(image.getAttribute('src')).toContain('http://localhost:3001/assets/img-42/stream');
      expect(image.getAttribute('src')).toContain('token=test');
    });
  });

  describe('close behaviour', () => {
    it('calls onClose when the × button is clicked', () => {
      const onClose = vi.fn();
      render(<AssetPreviewModal asset={makeAsset()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /close asset preview/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when the backdrop overlay is clicked directly', () => {
      const onClose = vi.fn();
      render(<AssetPreviewModal asset={makeAsset()} onClose={onClose} />);
      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose when clicking inside the modal content', () => {
      const onClose = vi.fn();
      render(<AssetPreviewModal asset={makeAsset()} onClose={onClose} />);
      const heading = screen.getByRole('heading', { name: /clip\.mp4/i });
      fireEvent.click(heading);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<AssetPreviewModal asset={makeAsset()} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('ignores other key presses', () => {
      const onClose = vi.fn();
      render(<AssetPreviewModal asset={makeAsset()} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'a' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('removes the Escape listener on unmount', () => {
      const onClose = vi.fn();
      const { unmount } = render(
        <AssetPreviewModal asset={makeAsset()} onClose={onClose} />,
      );
      unmount();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
