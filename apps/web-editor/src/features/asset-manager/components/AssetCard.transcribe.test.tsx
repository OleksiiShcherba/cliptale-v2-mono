import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AssetCard } from './AssetCard';
import { makeAsset } from './AssetCard.fixtures';

// ── Mock config so the component does not require real env vars ───────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// ── Mock TranscribeButton so AssetCard can be tested in isolation ────────────

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: ({ fileId }: { fileId: string }) =>
    React.createElement('button', { 'data-testid': 'transcribe-button', 'data-asset-id': fileId }, 'Transcribe'),
}));

// ── TranscribeButton visibility tests ─────────────────────────────────────────

describe('AssetCard / TranscribeButton visibility', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows TranscribeButton for a ready video asset', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'ready', contentType: 'video/mp4' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId('transcribe-button')).toBeDefined();
  });

  it('shows TranscribeButton for a ready audio asset', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'ready', contentType: 'audio/mpeg' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId('transcribe-button')).toBeDefined();
  });

  it('does NOT show TranscribeButton when asset status is processing', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'processing', contentType: 'video/mp4' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });

  it('does NOT show TranscribeButton when asset status is pending', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'pending', contentType: 'video/mp4' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });

  it('does NOT show TranscribeButton when asset status is error', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'error', contentType: 'video/mp4' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });

  it('does NOT show TranscribeButton for a ready image asset', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'ready', contentType: 'image/png' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });

  it('does NOT show TranscribeButton for a ready generic file', () => {
    render(
      <AssetCard
        asset={makeAsset({ status: 'ready', contentType: 'application/pdf' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('transcribe-button')).toBeNull();
  });

  it('passes the correct fileId to TranscribeButton', () => {
    render(
      <AssetCard
        asset={makeAsset({ id: 'asset-xyz', status: 'ready', contentType: 'video/mp4' })}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    const btn = screen.getByTestId('transcribe-button');
    expect(btn.getAttribute('data-asset-id')).toBe('asset-xyz');
  });
});
