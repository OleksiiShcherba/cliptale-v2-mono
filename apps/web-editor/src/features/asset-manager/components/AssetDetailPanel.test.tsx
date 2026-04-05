import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAddAssetToTimeline = vi.fn();
vi.mock('@/features/asset-manager/hooks/useAddAssetToTimeline', () => ({
  useAddAssetToTimeline: () => mockAddAssetToTimeline,
}));

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ assetId }: { assetId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': assetId }, 'Transcribe'),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
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

describe('AssetDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Add to Timeline button', () => {
    it('renders the "Add to Timeline" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} />);
      expect(screen.getByRole('button', { name: /add.*timeline/i })).toBeDefined();
    });

    it('is enabled when asset status is ready', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('is disabled when asset status is processing', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is disabled when asset status is pending', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'pending' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is disabled when asset status is error', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'error' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('shows a "Processing…" tooltip via title when disabled', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i });
      expect(btn.getAttribute('title')).toBe('Processing…');
    });

    it('has no title attribute when enabled (status ready)', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i });
      expect(btn.getAttribute('title')).toBeNull();
    });

    it('calls addAssetToTimeline with the asset when clicked', () => {
      const asset = makeAsset({ status: 'ready' });
      render(<AssetDetailPanel asset={asset} />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(mockAddAssetToTimeline).toHaveBeenCalledWith(asset);
    });

    it('does not call addAssetToTimeline when button is disabled', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(mockAddAssetToTimeline).not.toHaveBeenCalled();
    });
  });

  describe('TranscribeButton', () => {
    it('renders TranscribeButton for video assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4' })} />);
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('renders TranscribeButton for audio assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'audio/mpeg' })} />);
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('does not render TranscribeButton for image assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'image/png' })} />);
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('passes the asset id to TranscribeButton', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4', id: 'asset-xyz' })} />);
      expect(screen.getByTestId('transcribe-button').getAttribute('data-asset-id')).toBe('asset-xyz');
    });
  });

  describe('preview thumbnail', () => {
    it('renders an img element when thumbnailUri is provided', () => {
      render(<AssetDetailPanel asset={makeAsset({ thumbnailUri: 'https://example.com/thumb.jpg' })} />);
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img).toBeDefined();
      expect(img.src).toBe('https://example.com/thumb.jpg');
    });

    it('renders "No preview" text when thumbnailUri is null', () => {
      render(<AssetDetailPanel asset={makeAsset({ thumbnailUri: null })} />);
      expect(screen.getByText('No preview')).toBeDefined();
    });
  });

  describe('existing content', () => {
    it('renders the filename', () => {
      render(<AssetDetailPanel asset={makeAsset({ filename: 'my-video.mp4' })} />);
      expect(screen.getByText('my-video.mp4')).toBeDefined();
    });

    it('renders the asset status badge', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} />);
      expect(screen.getByLabelText(/status: ready/i)).toBeDefined();
    });
  });
});
