import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/features/asset-manager/api', () => ({
  updateAsset: vi.fn(),
}));

vi.mock('./AddToTimelineDropdown', () => ({
  AddToTimelineDropdown: ({ asset, projectId, disabled }: { asset: Asset; projectId: string; disabled?: boolean }) =>
    React.createElement('button', {
      'data-testid': 'add-to-timeline-dropdown',
      disabled: disabled ?? false,
    }, 'Add to Timeline'),
}));

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ fileId }: { fileId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': fileId }, 'Transcribe'),
}));

vi.mock('./AssetPreviewModal', () => ({
  AssetPreviewModal: ({ asset, onClose }: { asset: Asset; onClose: () => void }) =>
    React.createElement('div', {
      'data-testid': 'asset-preview-modal',
      'data-asset-id': asset.id,
      role: 'dialog',
      'aria-modal': 'true',
    }, React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close')),
}));

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

describe('AssetDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preview thumbnail', () => {
    it('renders an img element when thumbnailUri is provided', () => {
      render(<AssetDetailPanel asset={makeAsset({ thumbnailUri: 'https://example.com/thumb.jpg' })} projectId="proj-001" />);
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img).toBeDefined();
      expect(img.src).toBe('https://example.com/thumb.jpg');
    });

    it('renders "No preview" text for video asset when thumbnailUri is null', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4', thumbnailUri: null })} projectId="proj-001" />);
      expect(screen.getByText('No preview')).toBeDefined();
    });

    it('renders "No preview" text for audio asset when thumbnailUri is null', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'audio/mpeg', thumbnailUri: null })} projectId="proj-001" />);
      expect(screen.getByText('No preview')).toBeDefined();
    });

    it('renders an img element for a ready image asset using the stream URL', () => {
      const { container } = render(
        <AssetDetailPanel
          asset={makeAsset({ id: 'img-001', contentType: 'image/png', thumbnailUri: null, status: 'ready' })}
          projectId="proj-001"
        />,
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect((img as HTMLImageElement).src).toContain('/assets/img-001/stream');
    });

    it('renders "No preview" for a processing image asset', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'processing' })}
          projectId="proj-001"
        />,
      );
      expect(screen.getByText('No preview')).toBeDefined();
    });
  });

  describe('Preview button', () => {
    it('renders the Preview button', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      expect(screen.getByRole('button', { name: /preview asset/i })).toBeDefined();
    });

    it('is enabled when asset status is ready', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} projectId="proj-001" />);
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('is disabled when asset status is processing', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} projectId="proj-001" />);
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is disabled when asset status is pending', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'pending' })} projectId="proj-001" />);
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is disabled when asset status is error', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'error' })} projectId="proj-001" />);
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('does not render the modal when Preview has not been clicked', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      expect(screen.queryByTestId('asset-preview-modal')).toBeNull();
    });

    it('opens AssetPreviewModal when the Preview button is clicked', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /preview asset/i }));
      expect(screen.getByTestId('asset-preview-modal')).toBeDefined();
    });

    it('passes the correct asset to AssetPreviewModal', () => {
      render(<AssetDetailPanel asset={makeAsset({ id: 'asset-xyz' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /preview asset/i }));
      expect(screen.getByTestId('asset-preview-modal').getAttribute('data-asset-id')).toBe('asset-xyz');
    });

    it('closes AssetPreviewModal when onClose is called', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /preview asset/i }));
      expect(screen.getByTestId('asset-preview-modal')).toBeDefined();
      fireEvent.click(screen.getByTestId('modal-close'));
      expect(screen.queryByTestId('asset-preview-modal')).toBeNull();
    });
  });

  describe('status badge overlay (task 5)', () => {
    it('status badge is inside the preview container (overlaid)', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ status: 'ready', thumbnailUri: null })} projectId="proj-001" />,
      );
      const badge = screen.getByLabelText(/status: ready/i);
      expect(badge.style.position).toBe('absolute');
    });

    it('status badge is positioned at bottom-right of preview', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ status: 'processing' })} projectId="proj-001" />,
      );
      const badge = screen.getByLabelText(/status: processing/i);
      expect(badge.style.bottom).toBe('8px');
      expect(badge.style.right).toBe('8px');
    });
  });
});
