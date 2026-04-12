import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

const mockInvalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockUpdateAsset = vi.fn();
vi.mock('@/features/asset-manager/api', () => ({
  updateAsset: (...args: unknown[]) => mockUpdateAsset(...args),
}));

vi.mock('./AddToTimelineDropdown', () => ({
  AddToTimelineDropdown: ({ asset, projectId, disabled }: { asset: Asset; projectId: string; disabled?: boolean }) =>
    React.createElement('button', {
      'data-testid': 'add-to-timeline-dropdown',
      'data-asset-id': asset.id,
      'data-project-id': projectId,
      disabled: disabled ?? false,
    }, 'Add to Timeline'),
}));

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ assetId }: { assetId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': assetId }, 'Transcribe'),
}));

vi.mock('./AssetPreviewModal', () => ({
  AssetPreviewModal: ({ onClose }: { asset: Asset; onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'asset-preview-modal' },
      React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close')),
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

// ── Tests ──────────────────────────��──────────────────────────────────────────

describe('AssetDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('inline rename — display name fallback', () => {
    it('shows filename when displayName is null', () => {
      render(<AssetDetailPanel asset={makeAsset({ filename: 'clip.mp4', displayName: null })} projectId="proj-001" />);
      expect(screen.getByText('clip.mp4')).toBeDefined();
    });

    it('shows displayName when set, not filename', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ filename: 'clip.mp4', displayName: 'My Great Clip' })}
          projectId="proj-001"
        />,
      );
      expect(screen.getByText('My Great Clip')).toBeDefined();
      expect(screen.queryByText('clip.mp4')).toBeNull();
    });

    it('renders the pencil/rename button', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      expect(screen.getByRole('button', { name: /rename asset/i })).toBeDefined();
    });
  });

  describe('inline rename — edit flow', () => {
    it('shows an input with the current displayed name when the rename button is clicked', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ filename: 'clip.mp4', displayName: 'My Clip' })}
          projectId="proj-001"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i }) as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe('My Clip');
    });

    it('pre-fills the input with filename when displayName is null', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ filename: 'clip.mp4', displayName: null })}
          projectId="proj-001"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i }) as HTMLInputElement;
      expect(input.value).toBe('clip.mp4');
    });

    it('pressing Escape cancels the rename and reverts to view mode', () => {
      render(<AssetDetailPanel asset={makeAsset({ filename: 'clip.mp4' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      expect(screen.getByRole('textbox', { name: /asset display name/i })).toBeDefined();
      fireEvent.keyDown(screen.getByRole('textbox', { name: /asset display name/i }), { key: 'Escape' });
      expect(screen.queryByRole('textbox', { name: /asset display name/i })).toBeNull();
      expect(screen.getByText('clip.mp4')).toBeDefined();
    });

    it('does not call updateAsset when Escape is pressed', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      fireEvent.keyDown(screen.getByRole('textbox', { name: /asset display name/i }), { key: 'Escape' });
      expect(mockUpdateAsset).not.toHaveBeenCalled();
    });

    it('calls updateAsset with trimmed value when Enter is pressed', async () => {
      mockUpdateAsset.mockResolvedValueOnce({ ...makeAsset(), displayName: 'New Name' });
      render(<AssetDetailPanel asset={makeAsset({ id: 'asset-001' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i });
      fireEvent.change(input, { target: { value: '  New Name  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(mockUpdateAsset).toHaveBeenCalledWith('asset-001', 'New Name');
      });
    });

    it('invalidates the assets query after a successful rename', async () => {
      mockUpdateAsset.mockResolvedValueOnce({ ...makeAsset(), displayName: 'New Name' });
      render(<AssetDetailPanel asset={makeAsset({ id: 'asset-001' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i });
      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['assets', 'proj-001'] });
      });
    });

    it('shows an error message when the name is empty and Enter is pressed', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i });
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('alert').textContent).toContain('cannot be empty');
    });

    it('shows an error message when the name exceeds 255 characters', () => {
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i });
      fireEvent.change(input, { target: { value: 'a'.repeat(256) } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByRole('alert').textContent).toContain('255 characters');
    });

    it('shows an error message when updateAsset fails', async () => {
      mockUpdateAsset.mockRejectedValueOnce(new Error('network error'));
      render(<AssetDetailPanel asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      const input = screen.getByRole('textbox', { name: /asset display name/i });
      fireEvent.change(input, { target: { value: 'New Name' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Failed to rename');
      });
    });

    it('does not call updateAsset when the value is unchanged', async () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ filename: 'clip.mp4', displayName: null })}
          projectId="proj-001"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /rename asset/i }));
      fireEvent.keyDown(screen.getByRole('textbox', { name: /asset display name/i }), { key: 'Enter' });
      await waitFor(() => {
        expect(mockUpdateAsset).not.toHaveBeenCalled();
      });
    });
  });
});
