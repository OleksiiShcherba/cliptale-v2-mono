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

vi.mock('@/features/asset-manager/components/AddToTimelineDropdown', () => ({
  AddToTimelineDropdown: ({ asset, projectId, disabled }: { asset: Asset; projectId: string; disabled?: boolean }) =>
    React.createElement('button', {
      'data-testid': 'add-to-timeline-dropdown',
      'data-asset-id': asset.id,
      'data-project-id': projectId,
      disabled: disabled ?? false,
      'aria-label': `Add ${asset.filename} to timeline`,
    }, 'Add to Timeline'),
}));

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ fileId }: { fileId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': fileId }, 'Transcribe'),
}));

vi.mock('@/features/asset-manager/components/AssetPreviewModal', () => ({
  AssetPreviewModal: () => React.createElement('div', { 'data-testid': 'asset-preview-modal' }),
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

  describe('AddToTimelineDropdown', () => {
    it('renders the AddToTimelineDropdown', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('add-to-timeline-dropdown')).toBeDefined();
    });

    it('passes disabled=false when asset status is ready', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const el = screen.getByTestId('add-to-timeline-dropdown') as HTMLButtonElement;
      expect(el.disabled).toBe(false);
    });

    it('passes disabled=true when asset status is processing', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const el = screen.getByTestId('add-to-timeline-dropdown') as HTMLButtonElement;
      expect(el.disabled).toBe(true);
    });

    it('passes disabled=true when asset status is pending', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'pending' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const el = screen.getByTestId('add-to-timeline-dropdown') as HTMLButtonElement;
      expect(el.disabled).toBe(true);
    });

    it('passes disabled=true when asset status is error', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'error' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const el = screen.getByTestId('add-to-timeline-dropdown') as HTMLButtonElement;
      expect(el.disabled).toBe(true);
    });

    it('passes the projectId to AddToTimelineDropdown', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('add-to-timeline-dropdown').getAttribute('data-project-id')).toBe('proj-001');
    });

    it('passes the asset id to AddToTimelineDropdown', () => {
      render(<AssetDetailPanel asset={makeAsset({ id: 'asset-xyz' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('add-to-timeline-dropdown').getAttribute('data-asset-id')).toBe('asset-xyz');
    });
  });

  describe('TranscribeButton', () => {
    it('renders TranscribeButton for video assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('renders TranscribeButton for audio assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'audio/mpeg' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('does not render TranscribeButton for image assets', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'image/png' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('passes the asset id to TranscribeButton', () => {
      render(<AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4', id: 'asset-xyz' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByTestId('transcribe-button').getAttribute('data-asset-id')).toBe('asset-xyz');
    });
  });

  describe('existing content', () => {
    it('renders the filename', () => {
      render(<AssetDetailPanel asset={makeAsset({ filename: 'my-video.mp4' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByText('my-video.mp4')).toBeDefined();
    });

    it('renders the asset status badge', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByLabelText(/status: ready/i)).toBeDefined();
    });
  });

  describe('close button (task 4)', () => {
    it('does not render a close button when onClose is not provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.queryByRole('button', { name: /close asset details/i })).toBeNull();
    });

    it('renders a close button when onClose is provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /close asset details/i })).toBeDefined();
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /close asset details/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('Replace File button', () => {
    it('renders the "Replace File" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByRole('button', { name: /replace file/i })).toBeDefined();
    });

    it('is disabled when onReplace is not provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const btn = screen.getByRole('button', { name: /replace file/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when onReplace is provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onReplace={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /replace file/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('calls onReplace when the button is clicked', () => {
      const onReplace = vi.fn();
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onReplace={onReplace} />);
      fireEvent.click(screen.getByRole('button', { name: /replace file/i }));
      expect(onReplace).toHaveBeenCalledOnce();
    });
  });

  describe('Delete Asset button', () => {
    it('renders the "Delete Asset" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      expect(screen.getByRole('button', { name: /delete asset/i })).toBeDefined();
    });

    it('is disabled when onDelete is not provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} />);
      const btn = screen.getByRole('button', { name: /delete asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when onDelete is provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onDelete={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /delete asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('calls onDelete when the button is clicked', () => {
      const onDelete = vi.fn();
      render(<AssetDetailPanel asset={makeAsset()} context={{ kind: 'project', projectId: 'proj-001' }} onDelete={onDelete} />);
      fireEvent.click(screen.getByRole('button', { name: /delete asset/i }));
      expect(onDelete).toHaveBeenCalledOnce();
    });
  });
});
