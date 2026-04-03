import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AssetCard } from './AssetCard';
import type { Asset } from '@/features/asset-manager/types';

// ── Mock TranscribeButton so AssetCard can be tested in isolation ────────────

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
    storageUri: 's3://bucket/clip.mp4',
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

describe('AssetCard', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renders', () => {
    it('renders the asset filename', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByText('clip.mp4')).toBeDefined();
    });

    it('renders a Video type label for video/mp4 content type', () => {
      render(<AssetCard asset={makeAsset({ contentType: 'video/mp4' })} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByText('Video')).toBeDefined();
    });

    it('renders an Audio type label for audio/mpeg content type', () => {
      render(<AssetCard asset={makeAsset({ contentType: 'audio/mpeg' })} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByText('Audio')).toBeDefined();
    });

    it('renders an Image type label for image/png content type', () => {
      render(<AssetCard asset={makeAsset({ contentType: 'image/png', status: 'ready' })} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByText('Image')).toBeDefined();
    });

    it('renders a File label for unknown content type', () => {
      render(<AssetCard asset={makeAsset({ contentType: 'application/pdf', status: 'ready' })} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByText('File')).toBeDefined();
    });

    it('renders a status badge with the asset status text', () => {
      render(<AssetCard asset={makeAsset({ status: 'processing' })} isSelected={false} onSelect={onSelect} />);
      expect(screen.getByLabelText('Status: processing')).toBeDefined();
    });

    it('renders a thumbnail image when thumbnailUri is set', () => {
      const { container } = render(
        <AssetCard
          asset={makeAsset({ thumbnailUri: 'https://cdn.example.com/thumb.jpg' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      // The img has alt="" and lives inside aria-hidden, so query via DOM directly.
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toBe('https://cdn.example.com/thumb.jpg');
    });

    it('does not render an img element when thumbnailUri is null', () => {
      const { container } = render(
        <AssetCard asset={makeAsset({ thumbnailUri: null })} isSelected={false} onSelect={onSelect} />,
      );
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('selection state', () => {
    it('sets aria-pressed=true when isSelected is true', () => {
      render(<AssetCard asset={makeAsset()} isSelected={true} onSelect={onSelect} />);
      const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });
      expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('sets aria-pressed=false when isSelected is false', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });

    it('calls onSelect with the asset id when clicked', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      fireEvent.click(screen.getByRole('button', { name: /Asset: clip.mp4/ }));
      expect(onSelect).toHaveBeenCalledWith('asset-001');
    });

    it('calls onSelect when Enter key is pressed', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      fireEvent.keyDown(screen.getByRole('button', { name: /Asset: clip.mp4/ }), { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('asset-001');
    });

    it('calls onSelect when Space key is pressed', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      fireEvent.keyDown(screen.getByRole('button', { name: /Asset: clip.mp4/ }), { key: ' ' });
      expect(onSelect).toHaveBeenCalledWith('asset-001');
    });

    it('does not call onSelect for unrelated key presses', () => {
      render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
      fireEvent.keyDown(screen.getByRole('button', { name: /Asset: clip.mp4/ }), { key: 'Escape' });
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('TranscribeButton visibility', () => {
    it('shows TranscribeButton for a ready video asset', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'ready', contentType: 'video/mp4' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('shows TranscribeButton for a ready audio asset', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'ready', contentType: 'audio/mpeg' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('does NOT show TranscribeButton when asset status is processing', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'processing', contentType: 'video/mp4' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('does NOT show TranscribeButton when asset status is pending', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'pending', contentType: 'video/mp4' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('does NOT show TranscribeButton when asset status is error', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'error', contentType: 'video/mp4' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('does NOT show TranscribeButton for a ready image asset', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'ready', contentType: 'image/png' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('does NOT show TranscribeButton for a ready generic file', () => {
      render(
        <AssetCard
          asset={makeAsset({ status: 'ready', contentType: 'application/pdf' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('passes the correct assetId to TranscribeButton', () => {
      render(
        <AssetCard
          asset={makeAsset({ id: 'asset-xyz', status: 'ready', contentType: 'video/mp4' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      const btn = screen.getByTestId('transcribe-button');
      expect(btn.getAttribute('data-asset-id')).toBe('asset-xyz');
    });
  });
});
