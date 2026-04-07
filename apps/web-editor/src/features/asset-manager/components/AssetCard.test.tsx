import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AssetCard } from './AssetCard';
import { makeAsset } from './AssetCard.fixtures';

// ── Mock config so the component does not require real env vars ───────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// ── Mock TranscribeButton so AssetCard can be tested in isolation ────────────

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ assetId }: { assetId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': assetId }, 'Transcribe'),
}));

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

    it('does not render an img element for video asset when thumbnailUri is null', () => {
      const { container } = render(
        <AssetCard asset={makeAsset({ contentType: 'video/mp4', thumbnailUri: null })} isSelected={false} onSelect={onSelect} />,
      );
      expect(container.querySelector('img')).toBeNull();
    });

    it('renders an img element for a ready image asset when thumbnailUri is null (stream URL fallback)', () => {
      const { container } = render(
        <AssetCard asset={makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'ready' })} isSelected={false} onSelect={onSelect} />,
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toContain('/assets/asset-001/stream');
    });

    it('does not render an img element for image asset when status is processing', () => {
      const { container } = render(
        <AssetCard asset={makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'processing' })} isSelected={false} onSelect={onSelect} />,
      );
      expect(container.querySelector('img')).toBeNull();
    });

    it('renders a video type icon for video content when thumbnailUri is null', () => {
      render(
        <AssetCard asset={makeAsset({ contentType: 'video/mp4', thumbnailUri: null })} isSelected={false} onSelect={onSelect} />,
      );
      expect(screen.getByTestId('type-icon-video')).toBeDefined();
    });

    it('renders an audio type icon for audio content when thumbnailUri is null', () => {
      render(
        <AssetCard asset={makeAsset({ contentType: 'audio/mpeg', thumbnailUri: null })} isSelected={false} onSelect={onSelect} />,
      );
      expect(screen.getByTestId('type-icon-audio')).toBeDefined();
    });

    it('renders an image type icon for image content when thumbnailUri is null and status is processing', () => {
      render(
        <AssetCard asset={makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'processing' })} isSelected={false} onSelect={onSelect} />,
      );
      expect(screen.getByTestId('type-icon-image')).toBeDefined();
    });

    it('renders a file type icon for unknown content type when thumbnailUri is null', () => {
      render(
        <AssetCard asset={makeAsset({ contentType: 'application/pdf', thumbnailUri: null })} isSelected={false} onSelect={onSelect} />,
      );
      expect(screen.getByTestId('type-icon-file')).toBeDefined();
    });

    it('does not render a type icon when thumbnailUri is set', () => {
      render(
        <AssetCard
          asset={makeAsset({ contentType: 'video/mp4', thumbnailUri: 'https://cdn.example.com/thumb.jpg' })}
          isSelected={false}
          onSelect={onSelect}
        />,
      );
      expect(screen.queryByTestId('type-icon-video')).toBeNull();
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
});
