/**
 * AssetDetailPanel — project context + shared behaviour tests.
 * Draft context tests live in AssetDetailPanel.draft.test.tsx.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';
import { makeAsset, PROJECT_CTX, DRAFT_CTX } from './AssetDetailPanel.fixtures';

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
  AddToTimelineDropdown: ({ asset, projectId, disabled }: {
    asset: Asset;
    projectId: string;
    disabled?: boolean;
  }) =>
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
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-file-id': fileId }, 'Transcribe'),
}));

vi.mock('@/features/asset-manager/components/AssetPreviewModal', () => ({
  AssetPreviewModal: ({ onClose }: { asset: Asset; onClose: () => void }) =>
    React.createElement('div', {
      'data-testid': 'asset-preview-modal',
    }, React.createElement('button', { onClick: onClose, 'data-testid': 'modal-close' }, 'Close')),
}));

vi.mock('@/features/asset-manager/components/InlineRenameField', () => ({
  InlineRenameField: ({ displayedName }: { fileId: string; projectId: string; displayedName: string }) =>
    React.createElement('div', { 'data-testid': 'inline-rename-field' }, displayedName),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // project context — existing behaviour preserved
  // ---------------------------------------------------------------------------

  describe('project context', () => {
    it('renders the AddToTimelineDropdown', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(screen.getByTestId('add-to-timeline-dropdown')).toBeDefined();
    });

    it('does not render "Add to Prompt" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(screen.queryByRole('button', { name: /add.*to prompt/i })).toBeNull();
    });

    it('passes projectId to AddToTimelineDropdown', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(
        screen.getByTestId('add-to-timeline-dropdown').getAttribute('data-project-id'),
      ).toBe('proj-001');
    });

    it('disables AddToTimelineDropdown when asset is processing', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ status: 'processing' })}
          context={PROJECT_CTX}
        />,
      );
      const el = screen.getByTestId('add-to-timeline-dropdown') as HTMLButtonElement;
      expect(el.disabled).toBe(true);
    });

    it('renders the "Replace File" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(screen.getByRole('button', { name: /replace file/i })).toBeDefined();
    });

    it('"Replace File" is disabled when onReplace is not provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      const btn = screen.getByRole('button', { name: /replace file/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('calls onReplace when Replace File is clicked', () => {
      const onReplace = vi.fn();
      render(
        <AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} onReplace={onReplace} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /replace file/i }));
      expect(onReplace).toHaveBeenCalledOnce();
    });

    it('renders the "Delete Asset" button', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(screen.getByRole('button', { name: /delete asset/i })).toBeDefined();
    });

    it('calls onDelete when Delete Asset is clicked', () => {
      const onDelete = vi.fn();
      render(
        <AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} onDelete={onDelete} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /delete asset/i }));
      expect(onDelete).toHaveBeenCalledOnce();
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} onClose={onClose} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /close asset details/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('renders the Preview button enabled for a ready asset', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={PROJECT_CTX} />);
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('Preview button is disabled for a processing asset', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ status: 'processing' })} context={PROJECT_CTX} />,
      );
      const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // shared behaviour — both contexts
  // ---------------------------------------------------------------------------

  describe('shared behaviour (both contexts)', () => {
    it('renders the asset status badge', () => {
      render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={PROJECT_CTX} />);
      expect(screen.getByLabelText(/status: ready/i)).toBeDefined();
    });

    it('renders InlineRenameField with filename when displayName is null', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ filename: 'test.mp4', displayName: null })} context={PROJECT_CTX} />,
      );
      expect(screen.getByTestId('inline-rename-field').textContent).toBe('test.mp4');
    });

    it('renders InlineRenameField with displayName when set', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ filename: 'test.mp4', displayName: 'My Video' })}
          context={PROJECT_CTX}
        />,
      );
      expect(screen.getByTestId('inline-rename-field').textContent).toBe('My Video');
    });

    it('renders TranscribeButton for video assets', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ contentType: 'video/mp4' })} context={DRAFT_CTX} />,
      );
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('renders TranscribeButton for audio assets', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ contentType: 'audio/mpeg' })} context={PROJECT_CTX} />,
      );
      expect(screen.getByTestId('transcribe-button')).toBeDefined();
    });

    it('does not render TranscribeButton for image assets', () => {
      render(
        <AssetDetailPanel asset={makeAsset({ contentType: 'image/png' })} context={PROJECT_CTX} />,
      );
      expect(screen.queryByTestId('transcribe-button')).toBeNull();
    });

    it('does not render close button when onClose is not provided', () => {
      render(<AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />);
      expect(screen.queryByRole('button', { name: /close asset details/i })).toBeNull();
    });

    it('renders close button when onClose is provided (draft context)', () => {
      const onClose = vi.fn();
      render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} onClose={onClose} />);
      expect(screen.getByRole('button', { name: /close asset details/i })).toBeDefined();
    });
  });
});
