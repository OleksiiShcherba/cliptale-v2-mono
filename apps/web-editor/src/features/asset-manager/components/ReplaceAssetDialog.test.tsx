import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { ReplaceAssetDialog } from './ReplaceAssetDialog';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

const { mockReplaceAsset } = vi.hoisted(() => ({
  mockReplaceAsset: vi.fn(),
}));
vi.mock('@/features/asset-manager/hooks/useReplaceAsset', () => ({
  useReplaceAsset: () => mockReplaceAsset,
}));

const { mockUploadFiles } = vi.hoisted(() => ({
  mockUploadFiles: vi.fn(),
}));
let capturedOnUploadComplete: ((id: string) => void) | null = null;
vi.mock('@/features/asset-manager/hooks/useAssetUpload', () => ({
  useAssetUpload: ({ onUploadComplete }: { onUploadComplete: (id: string) => void }) => {
    capturedOnUploadComplete = onUploadComplete;
    return {
      uploadFiles: mockUploadFiles,
      entries: [],
    };
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/clip.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 5_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeLibraryAsset(id: string, filename: string, status: Asset['status'] = 'ready'): Asset {
  return makeAsset({ id, filename, status });
}

const defaultProps = {
  asset: makeAsset(),
  libraryAssets: [],
  projectId: 'proj-001',
  onClose: vi.fn(),
  onReplaced: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReplaceAssetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnUploadComplete = null;
  });

  describe('dialog structure', () => {
    it('renders as a dialog with correct aria label', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByRole('dialog', { name: /replace file/i })).toBeDefined();
    });

    it('renders the title "Replace File"', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByText('Replace File')).toBeDefined();
    });

    it('renders the asset filename in the warning', () => {
      render(<ReplaceAssetDialog {...{ ...defaultProps, asset: makeAsset({ filename: 'my-video.mp4' }) }} />);
      expect(screen.getByText(/my-video\.mp4/)).toBeDefined();
    });

    it('mentions that undo is possible in the warning', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByText(/ctrl\+z/i)).toBeDefined();
    });

    it('mentions version history as a restore option', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByText(/version history/i)).toBeDefined();
    });

    it('renders close button in header', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /close replace file dialog/i })).toBeDefined();
    });
  });

  describe('close behaviour', () => {
    it('calls onClose when header close button is clicked', () => {
      const onClose = vi.fn();
      render(<ReplaceAssetDialog {...{ ...defaultProps, onClose }} />);
      fireEvent.click(screen.getByRole('button', { name: /close replace file dialog/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when Cancel button is clicked', () => {
      const onClose = vi.fn();
      render(<ReplaceAssetDialog {...{ ...defaultProps, onClose }} />);
      fireEvent.click(screen.getByRole('button', { name: /cancel replace/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when the overlay (dialog element itself) is clicked directly', () => {
      const onClose = vi.fn();
      render(<ReplaceAssetDialog {...{ ...defaultProps, onClose }} />);
      // The outer dialog element serves as both the overlay and the ARIA dialog.
      // handleOverlayClick only fires onClose when e.target === e.currentTarget,
      // which happens when the user clicks the semi-transparent backdrop outside
      // the inner modal box. We simulate that by dispatching the event directly
      // on the element without a child target.
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog, { target: dialog });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('library selection', () => {
    it('shows "No other ready assets" when library is empty', () => {
      render(<ReplaceAssetDialog {...{ ...defaultProps, libraryAssets: [] }} />);
      expect(screen.getByText(/no other ready assets/i)).toBeDefined();
    });

    it('shows "No other ready assets" when only the current asset is in the library', () => {
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [defaultProps.asset] }}
        />,
      );
      expect(screen.getByText(/no other ready assets/i)).toBeDefined();
    });

    it('does not show processing assets in library list', () => {
      const processingAsset = makeLibraryAsset('asset-002', 'processing.mp4', 'processing');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [processingAsset] }}
        />,
      );
      expect(screen.queryByText('processing.mp4')).toBeNull();
    });

    it('renders ready library assets as selectable options', () => {
      const candidate = makeLibraryAsset('asset-002', 'replacement.mp4');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [candidate] }}
        />,
      );
      expect(screen.getByText('replacement.mp4')).toBeDefined();
    });

    it('Replace button is disabled when no library asset is selected', () => {
      const candidate = makeLibraryAsset('asset-002', 'replacement.mp4');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [candidate] }}
        />,
      );
      const replaceBtn = screen.getByRole('button', { name: /replace with selected asset/i }) as HTMLButtonElement;
      expect(replaceBtn.disabled).toBe(true);
    });

    it('Replace button is enabled after selecting a library asset', () => {
      const candidate = makeLibraryAsset('asset-002', 'replacement.mp4');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [candidate] }}
        />,
      );
      fireEvent.click(screen.getByText('replacement.mp4'));
      const replaceBtn = screen.getByRole('button', { name: /replace with selected asset/i }) as HTMLButtonElement;
      expect(replaceBtn.disabled).toBe(false);
    });

    it('calls replaceAsset with oldAssetId and selectedId when Replace is clicked', () => {
      const candidate = makeLibraryAsset('asset-002', 'replacement.mp4');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [candidate] }}
        />,
      );
      fireEvent.click(screen.getByText('replacement.mp4'));
      fireEvent.click(screen.getByRole('button', { name: /replace with selected asset/i }));
      expect(mockReplaceAsset).toHaveBeenCalledWith('asset-001', 'asset-002');
    });

    it('calls onReplaced after replacing from library', () => {
      const onReplaced = vi.fn();
      const candidate = makeLibraryAsset('asset-002', 'replacement.mp4');
      render(
        <ReplaceAssetDialog
          {...{ ...defaultProps, libraryAssets: [candidate], onReplaced }}
        />,
      );
      fireEvent.click(screen.getByText('replacement.mp4'));
      fireEvent.click(screen.getByRole('button', { name: /replace with selected asset/i }));
      expect(onReplaced).toHaveBeenCalledOnce();
    });
  });

  describe('upload new file', () => {
    it('renders the upload area', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /upload replacement file/i })).toBeDefined();
    });

    it('renders a hidden file input for upload', () => {
      const { container } = render(<ReplaceAssetDialog {...defaultProps} />);
      const input = container.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).style.display).toBe('none');
    });

    it('calls uploadFiles when a file is selected', () => {
      const { container } = render(<ReplaceAssetDialog {...defaultProps} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'new-video.mp4', { type: 'video/mp4' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
      expect(mockUploadFiles).toHaveBeenCalled();
    });

    it('calls replaceAsset with old and new assetId when onUploadComplete fires', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      // Simulate the upload hook completing with a new asset id
      capturedOnUploadComplete!('asset-uploaded-001');
      expect(mockReplaceAsset).toHaveBeenCalledWith('asset-001', 'asset-uploaded-001');
    });

    it('calls onReplaced after upload completes', () => {
      const onReplaced = vi.fn();
      render(<ReplaceAssetDialog {...{ ...defaultProps, onReplaced }} />);
      capturedOnUploadComplete!('asset-uploaded-002');
      expect(onReplaced).toHaveBeenCalledOnce();
    });
  });

  describe('accessibility', () => {
    it('has aria-modal=true', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    });

    it('has aria-labelledby pointing to the title heading', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-labelledby')).toBe('replace-asset-title');
    });

    it('has aria-describedby pointing to the warning description', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-describedby')).toBe('replace-asset-desc');
    });

    it('library list has role="listbox"', () => {
      render(<ReplaceAssetDialog {...defaultProps} />);
      expect(screen.getByRole('listbox')).toBeDefined();
    });
  });
});
