/**
 * AssetDetailPanel — fluid layout (compact=false) tests.
 * Verifies that passing compact={false} applies 100% / maxWidth-520 styles
 * to the root element and that all existing draft-context behaviour is intact.
 *
 * Acceptance criteria from subtask 3:
 * - compact=false → root width '100%' and maxWidth 520.
 * - compact=true (default) → root width 280.
 * - Existing behaviour (buttons, actions, close) continues to work.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';

import { AssetDetailPanel } from './AssetDetailPanel';
import { makeAsset, DRAFT_CTX, PROJECT_CTX } from './AssetDetailPanel.fixtures';

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
  AddToTimelineDropdown: ({ asset }: { asset: Asset; projectId: string; disabled?: boolean }) =>
    React.createElement('button', { 'data-testid': 'add-to-timeline-dropdown' }, `Add ${asset.filename}`),
}));

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: () =>
    React.createElement('button', { 'data-testid': 'transcribe-button' }, 'Transcribe'),
}));

vi.mock('@/features/asset-manager/components/AssetPreviewModal', () => ({
  AssetPreviewModal: ({ onClose }: { asset: Asset; onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'asset-preview-modal' },
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}));

vi.mock('@/features/asset-manager/components/InlineRenameField', () => ({
  InlineRenameField: ({ displayedName }: {
    fileId: string;
    projectId: string;
    displayedName: string;
    onRenameSuccess?: () => void;
  }) =>
    React.createElement('div', { 'data-testid': 'inline-rename-field' }, displayedName),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the root <div> element rendered by AssetDetailPanel. */
function getRootEl(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetDetailPanel — fluid layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Root style assertions
  // ---------------------------------------------------------------------------

  describe('root style', () => {
    it('compact=true (default) → root.width is 280px', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} />,
      );
      expect(getRootEl(container).style.width).toBe('280px');
    });

    it('compact=false → root.width is 100%', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} compact={false} />,
      );
      expect(getRootEl(container).style.width).toBe('100%');
    });

    it('compact=false → root.maxWidth is 520px', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} compact={false} />,
      );
      expect(getRootEl(container).style.maxWidth).toBe('520px');
    });

    it('compact=true → root.height is 620px', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} compact={true} />,
      );
      expect(getRootEl(container).style.height).toBe('620px');
    });

    it('compact=false → root has no fixed height (minHeight set instead)', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} compact={false} />,
      );
      const root = getRootEl(container);
      expect(root.style.height).toBe('');
      expect(root.style.minHeight).toBe('620px');
    });

    it('compact prop defaults to true (no explicit prop → 280px width)', () => {
      const { container } = render(
        <AssetDetailPanel asset={makeAsset()} context={PROJECT_CTX} />,
      );
      expect(getRootEl(container).style.width).toBe('280px');
    });
  });

  // ---------------------------------------------------------------------------
  // Behaviour unchanged in fluid mode
  // ---------------------------------------------------------------------------

  describe('draft-context behaviour in compact=false', () => {
    it('renders the "Add to Prompt" button', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset()}
          context={DRAFT_CTX}
          compact={false}
          onAddToPrompt={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /add.*to prompt/i })).toBeDefined();
    });

    it('does not render "Replace File" button', () => {
      render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} compact={false} />,
      );
      expect(screen.queryByRole('button', { name: /replace file/i })).toBeNull();
    });

    it('renders close button when onClose is provided', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset()}
          context={DRAFT_CTX}
          compact={false}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /close asset details/i })).toBeDefined();
    });

    it('renders the status badge', () => {
      render(
        <AssetDetailPanel
          asset={makeAsset({ status: 'ready' })}
          context={DRAFT_CTX}
          compact={false}
        />,
      );
      expect(screen.getByLabelText(/status: ready/i)).toBeDefined();
    });

    it('renders the Preview button', () => {
      render(
        <AssetDetailPanel asset={makeAsset()} context={DRAFT_CTX} compact={false} />,
      );
      expect(screen.getByRole('button', { name: /preview asset/i })).toBeDefined();
    });
  });
});
