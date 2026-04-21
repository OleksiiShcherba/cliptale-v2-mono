/**
 * AssetDetailPanel — draft context tests.
 * Project context + shared behaviour tests live in AssetDetailPanel.test.tsx.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';
import { makeAsset, DRAFT_CTX } from './AssetDetailPanel.fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// Hoist invalidateQueries so we can assert on it in the rename test.
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock('@/features/asset-manager/api', () => ({
  updateAsset: vi.fn(),
}));

vi.mock('@/features/asset-manager/components/AddToTimelineDropdown', () => ({
  AddToTimelineDropdown: () =>
    React.createElement('button', { 'data-testid': 'add-to-timeline-dropdown' }, 'Add to Timeline'),
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

// The InlineRenameField mock exposes onRenameSuccess so the rename-invalidation
// test can call it directly (simulating a successful rename commit).
vi.mock('@/features/asset-manager/components/InlineRenameField', () => ({
  InlineRenameField: ({
    displayedName,
    onRenameSuccess,
  }: {
    fileId: string;
    projectId: string;
    displayedName: string;
    onRenameSuccess?: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'inline-rename-field' },
      displayedName,
      React.createElement(
        'button',
        { 'data-testid': 'simulate-rename-success', onClick: onRenameSuccess },
        'rename',
      ),
    ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetDetailPanel — draft context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Add to Prompt" button', () => {
    const onAddToPrompt = vi.fn();
    render(
      <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} onAddToPrompt={onAddToPrompt} />,
    );
    expect(screen.getByRole('button', { name: /add.*to prompt/i })).toBeDefined();
  });

  it('does not render the AddToTimelineDropdown', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    expect(screen.queryByTestId('add-to-timeline-dropdown')).toBeNull();
  });

  it('does not render the "Replace File" button', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    expect(screen.queryByRole('button', { name: /replace file/i })).toBeNull();
  });

  it('calls onAddToPrompt with the asset when "Add to Prompt" is clicked', () => {
    const onAddToPrompt = vi.fn();
    const asset = makeAsset({ id: 'asset-abc' });
    render(
      <AssetDetailPanel asset={asset} context={DRAFT_CTX} onAddToPrompt={onAddToPrompt} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add.*to prompt/i }));
    expect(onAddToPrompt).toHaveBeenCalledOnce();
    expect(onAddToPrompt).toHaveBeenCalledWith(asset);
  });

  it('"Add to Prompt" is disabled when asset status is processing', () => {
    const onAddToPrompt = vi.fn();
    render(
      <AssetDetailPanel
        asset={makeAsset({ status: 'processing' })}
        context={DRAFT_CTX}
        onAddToPrompt={onAddToPrompt}
      />,
    );
    const btn = screen.getByRole('button', { name: /add.*to prompt/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('"Add to Prompt" is disabled when asset status is pending', () => {
    const onAddToPrompt = vi.fn();
    render(
      <AssetDetailPanel
        asset={makeAsset({ status: 'pending' })}
        context={DRAFT_CTX}
        onAddToPrompt={onAddToPrompt}
      />,
    );
    const btn = screen.getByRole('button', { name: /add.*to prompt/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('"Add to Prompt" is disabled when asset status is error', () => {
    render(<AssetDetailPanel asset={makeAsset({ status: 'error' })} context={DRAFT_CTX} />);
    const btn = screen.getByRole('button', { name: /add.*to prompt/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('"Add to Prompt" is disabled when onAddToPrompt is not provided', () => {
    render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={DRAFT_CTX} />);
    const btn = screen.getByRole('button', { name: /add.*to prompt/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('"Add to Prompt" is enabled when asset is ready and onAddToPrompt is provided', () => {
    const onAddToPrompt = vi.fn();
    render(
      <AssetDetailPanel
        asset={makeAsset({ status: 'ready' })}
        context={DRAFT_CTX}
        onAddToPrompt={onAddToPrompt}
      />,
    );
    const btn = screen.getByRole('button', { name: /add.*to prompt/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('renders the "Delete Asset" button', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    expect(screen.getByRole('button', { name: /delete asset/i })).toBeDefined();
  });

  it('"Delete Asset" is disabled when onDelete is not provided', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    const btn = screen.getByRole('button', { name: /delete asset/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onDelete when Delete Asset is clicked', () => {
    const onDelete = vi.fn();
    render(
      <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete asset/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders the Preview button', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    expect(screen.getByRole('button', { name: /preview asset/i })).toBeDefined();
  });

  it('Preview button is enabled for a ready asset', () => {
    render(<AssetDetailPanel asset={makeAsset({ status: 'ready' })} context={DRAFT_CTX} />);
    const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('Preview button is disabled for a processing asset', () => {
    render(
      <AssetDetailPanel asset={makeAsset({ status: 'processing' })} context={DRAFT_CTX} />,
    );
    const btn = screen.getByRole('button', { name: /preview asset/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close asset details/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the status badge with draft context', () => {
    render(<AssetDetailPanel asset={makeAsset({ status: 'processing' })} context={DRAFT_CTX} />);
    expect(screen.getByLabelText(/status: processing/i)).toBeDefined();
  });

  it('invalidates wizard gallery key on rename in draft context', () => {
    render(<AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />);
    // Simulate a successful rename commit from InlineRenameField.
    fireEvent.click(screen.getByTestId('simulate-rename-success'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['generate-wizard', 'assets'],
    });
  });
});
