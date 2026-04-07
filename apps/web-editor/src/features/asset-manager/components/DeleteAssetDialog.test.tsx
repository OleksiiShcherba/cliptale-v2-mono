import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockDeleteAsset } = vi.hoisted(() => ({ mockDeleteAsset: vi.fn() }));
vi.mock('@/features/asset-manager/hooks/useDeleteAsset', () => ({
  useDeleteAsset: () => mockDeleteAsset,
}));

import { DeleteAssetDialog } from './DeleteAssetDialog';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'my-video.mp4',
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/my-video.mp4',
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

describe('DeleteAssetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dialog structure', () => {
    it('renders with role="dialog"', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    it('has aria-modal="true"', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    });

    it('renders the dialog title', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('heading', { name: /delete asset/i })).toBeDefined();
    });

    it('renders a close button', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /close delete asset dialog/i })).toBeDefined();
    });

    it('renders the Cancel button', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /cancel delete/i })).toBeDefined();
    });

    it('renders the Delete Asset confirm button', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /delete asset my-video\.mp4/i })).toBeDefined();
    });
  });

  describe('warning banner', () => {
    it('mentions the filename in the warning', () => {
      render(
        <DeleteAssetDialog asset={makeAsset({ filename: 'special-clip.mp4' })} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByText(/special-clip\.mp4/)).toBeDefined();
    });

    it('explains clips will be removed from the timeline', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByText(/clips that use/i)).toBeDefined();
      expect(screen.getByText(/removed from the timeline/i)).toBeDefined();
    });

    it('mentions empty tracks will also be deleted', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByText(/tracks that become empty/i)).toBeDefined();
    });

    it('informs the user the original file is not deleted', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByText(/original file is not deleted/i)).toBeDefined();
    });

    it('informs the user the action can be undone with Ctrl+Z', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      expect(screen.getByText(/ctrl\+z/i)).toBeDefined();
    });
  });

  describe('close behaviour', () => {
    it('calls onClose when the × button is clicked', () => {
      const onClose = vi.fn();
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={onClose} onDeleted={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /close delete asset dialog/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when the Cancel button is clicked', () => {
      const onClose = vi.fn();
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={onClose} onDeleted={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when clicking the backdrop overlay directly', () => {
      const onClose = vi.fn();
      const { container } = render(
        <DeleteAssetDialog asset={makeAsset()} onClose={onClose} onDeleted={vi.fn()} />,
      );
      // The overlay is the outermost div (the dialog element itself)
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not propagate to backdrop when clicking the modal title', () => {
      const onClose = vi.fn();
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={onClose} onDeleted={vi.fn()} />,
      );
      // Click the title heading (inside the modal card, not on the backdrop)
      const heading = screen.getByRole('heading', { name: /delete asset/i });
      fireEvent.click(heading);
      // onClose should NOT be called because the heading is inside the modal card, not the backdrop
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('confirm deletion', () => {
    it('calls deleteAsset with the asset id when confirmed', () => {
      render(
        <DeleteAssetDialog asset={makeAsset({ id: 'asset-xyz' })} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      expect(mockDeleteAsset).toHaveBeenCalledWith('asset-xyz');
    });

    it('calls onDeleted after confirming deletion', () => {
      const onDeleted = vi.fn();
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={onDeleted} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      expect(onDeleted).toHaveBeenCalledOnce();
    });

    it('calls deleteAsset before onDeleted', () => {
      const callOrder: string[] = [];
      mockDeleteAsset.mockImplementation(() => { callOrder.push('delete'); });
      const onDeleted = vi.fn().mockImplementation(() => { callOrder.push('deleted'); });

      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={onDeleted} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      expect(callOrder).toEqual(['delete', 'deleted']);
    });

    it('does not call onDeleted when Cancel is clicked', () => {
      const onDeleted = vi.fn();
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={onDeleted} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('does not call deleteAsset when Cancel is clicked', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(mockDeleteAsset).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has aria-labelledby pointing to the title element', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-labelledby')).toBe('delete-asset-title');
    });

    it('has aria-describedby pointing to the warning banner', () => {
      render(
        <DeleteAssetDialog asset={makeAsset()} onClose={vi.fn()} onDeleted={vi.fn()} />,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-describedby')).toBe('delete-asset-desc');
    });
  });
});
