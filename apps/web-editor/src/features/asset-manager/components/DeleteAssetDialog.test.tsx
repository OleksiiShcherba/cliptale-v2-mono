import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    displayName: null,
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

// Shared props factory so every test uses the same projectId wiring.
function dialogProps(overrides: Partial<React.ComponentProps<typeof DeleteAssetDialog>> = {}) {
  return {
    asset: makeAsset(),
    projectId: 'proj-001',
    onClose: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeleteAssetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteAsset.mockResolvedValue(undefined);
  });

  describe('dialog structure', () => {
    it('renders with role="dialog"', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    it('has aria-modal="true"', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    });

    it('renders the dialog title', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('heading', { name: /delete asset/i })).toBeDefined();
    });

    it('renders a close button', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('button', { name: /close delete asset dialog/i })).toBeDefined();
    });

    it('renders the Cancel button', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('button', { name: /cancel delete/i })).toBeDefined();
    });

    it('renders the Delete Asset confirm button', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByRole('button', { name: /delete asset my-video\.mp4/i })).toBeDefined();
    });
  });

  describe('warning banner', () => {
    it('mentions the filename in the warning', () => {
      render(
        <DeleteAssetDialog {...dialogProps({ asset: makeAsset({ filename: 'special-clip.mp4' }) })} />,
      );
      expect(screen.getByText(/special-clip\.mp4/)).toBeDefined();
    });

    it('explains clips will be removed from the timeline', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByText(/clips that use/i)).toBeDefined();
      expect(screen.getByText(/removed from the timeline/i)).toBeDefined();
    });

    it('mentions empty tracks will also be deleted', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByText(/tracks that become empty/i)).toBeDefined();
    });

    it('mentions the file will be moved to Trash', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByText(/file will be moved to trash/i)).toBeDefined();
    });

    it('notes the file can be restored from the Trash panel', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByText(/restore it from the trash panel/i)).toBeDefined();
    });

    it('notes timeline changes are undoable with Ctrl+Z', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      expect(screen.getByText(/ctrl\+z/i)).toBeDefined();
    });
  });

  describe('close behaviour', () => {
    it('calls onClose when the × button is clicked', () => {
      const onClose = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onClose })} />);
      fireEvent.click(screen.getByRole('button', { name: /close delete asset dialog/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when the Cancel button is clicked', () => {
      const onClose = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onClose })} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when clicking the backdrop overlay directly', () => {
      const onClose = vi.fn();
      const { container } = render(<DeleteAssetDialog {...dialogProps({ onClose })} />);
      const overlay = container.firstChild as HTMLElement;
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not propagate to backdrop when clicking the modal title', () => {
      const onClose = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onClose })} />);
      const heading = screen.getByRole('heading', { name: /delete asset/i });
      fireEvent.click(heading);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('confirm deletion', () => {
    it('calls deleteAsset with the asset id when confirmed', async () => {
      render(<DeleteAssetDialog {...dialogProps({ asset: makeAsset({ id: 'asset-xyz' }) })} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      await waitFor(() => expect(mockDeleteAsset).toHaveBeenCalledWith('asset-xyz'));
    });

    it('calls onDeleted after confirming deletion', async () => {
      const onDeleted = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onDeleted })} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    });

    it('calls deleteAsset before onDeleted', async () => {
      const callOrder: string[] = [];
      mockDeleteAsset.mockImplementation(async () => { callOrder.push('delete'); });
      const onDeleted = vi.fn().mockImplementation(() => { callOrder.push('deleted'); });

      render(<DeleteAssetDialog {...dialogProps({ onDeleted })} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      await waitFor(() => expect(callOrder).toEqual(['delete', 'deleted']));
    });

    it('does not call onDeleted when Cancel is clicked', () => {
      const onDeleted = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onDeleted })} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('does not call deleteAsset when Cancel is clicked', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
      expect(mockDeleteAsset).not.toHaveBeenCalled();
    });

    it('shows an error message when deleteAsset rejects and does not call onDeleted', async () => {
      mockDeleteAsset.mockRejectedValue(new Error('Asset is referenced by one or more clips'));
      const onDeleted = vi.fn();
      render(<DeleteAssetDialog {...dialogProps({ onDeleted })} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/referenced by one or more clips/);
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('switches the confirm button label to "Deleting…" while the request is in flight', async () => {
      let resolveDelete!: () => void;
      mockDeleteAsset.mockImplementation(() => new Promise<void>((r) => { resolveDelete = r; }));
      render(<DeleteAssetDialog {...dialogProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset my-video\.mp4/i }));
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /delete asset my-video\.mp4/i });
        expect(btn.textContent).toMatch(/deleting/i);
      });
      resolveDelete();
    });
  });

  describe('accessibility', () => {
    it('has aria-labelledby pointing to the title element', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-labelledby')).toBe('delete-asset-title');
    });

    it('has aria-describedby pointing to the warning banner', () => {
      render(<DeleteAssetDialog {...dialogProps()} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-describedby')).toBe('delete-asset-desc');
    });
  });
});
