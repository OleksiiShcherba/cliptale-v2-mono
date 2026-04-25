/**
 * WizardAssetDetailSlot tests.
 * Verifies that compact={false} is forwarded to AssetDetailPanel so the panel
 * fills the wizard right column, and that the loading placeholder renders
 * correctly when the asset is not yet loaded.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Asset } from '@/features/asset-manager/types';
import type { AssetDetailPanelProps } from '@/shared/asset-detail/AssetDetailPanel';

// ── Mock AssetDetailPanel to capture the compact prop ─────────────────────────

const { capturedProps } = vi.hoisted(() => ({
  capturedProps: [] as Partial<AssetDetailPanelProps>[],
}));

vi.mock('@/shared/asset-detail/AssetDetailPanel', () => ({
  AssetDetailPanel: (props: AssetDetailPanelProps) => {
    capturedProps.push(props);
    return React.createElement('div', {
      'data-testid': 'asset-detail-panel',
      'data-compact': String(props.compact),
    });
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

import { WizardAssetDetailSlot } from './WizardAssetDetailSlot';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WizardAssetDetailSlot', () => {
  beforeEach(() => {
    capturedProps.length = 0;
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders loading placeholder when isLoading=true', () => {
      render(
        <WizardAssetDetailSlot
          asset={undefined}
          isLoading={true}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(screen.getByLabelText(/loading asset details/i)).toBeDefined();
    });

    it('renders loading placeholder when asset is undefined (isLoading=false)', () => {
      render(
        <WizardAssetDetailSlot
          asset={undefined}
          isLoading={false}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(screen.getByLabelText(/loading asset details/i)).toBeDefined();
    });

    it('does not render AssetDetailPanel while loading', () => {
      render(
        <WizardAssetDetailSlot
          asset={undefined}
          isLoading={true}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('asset-detail-panel')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Loaded state — compact={false} forwarded
  // ---------------------------------------------------------------------------

  describe('loaded state', () => {
    it('renders AssetDetailPanel when asset is available', () => {
      render(
        <WizardAssetDetailSlot
          asset={makeAsset()}
          isLoading={false}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(screen.getByTestId('asset-detail-panel')).toBeDefined();
    });

    it('forwards compact={false} to AssetDetailPanel', () => {
      render(
        <WizardAssetDetailSlot
          asset={makeAsset()}
          isLoading={false}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(capturedProps[0]?.compact).toBe(false);
    });

    it('sets context.kind to draft', () => {
      render(
        <WizardAssetDetailSlot
          asset={makeAsset()}
          isLoading={false}
          draftId="draft-abc"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(capturedProps[0]?.context).toEqual({ kind: 'draft', draftId: 'draft-abc' });
    });

    it('falls back to empty string draftId when draftId is null', () => {
      render(
        <WizardAssetDetailSlot
          asset={makeAsset()}
          isLoading={false}
          draftId={null}
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(capturedProps[0]?.context).toEqual({ kind: 'draft', draftId: '' });
    });

    it('does not render the loading placeholder when asset is available', () => {
      render(
        <WizardAssetDetailSlot
          asset={makeAsset()}
          isLoading={false}
          draftId="draft-001"
          onClose={vi.fn()}
          onAddToPrompt={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText(/loading asset details/i)).toBeNull();
    });
  });
});
