import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AssetCard } from './AssetCard';
import { makeAsset } from './AssetCard.fixtures';

// ── Mock config so the component does not require real env vars ───────────────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// ── Mock TranscribeButton so AssetCard can be tested in isolation ────────────

vi.mock('@/features/captions/components/TranscribeButton', () => ({
  TranscribeButton: () => null,
}));

// ── HTML5 drag-and-drop tests ─────────────────────────────────────────────────

describe('AssetCard / drag-and-drop', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has draggable=true when asset status is ready', () => {
    render(<AssetCard asset={makeAsset({ status: 'ready' })} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('has draggable=false (or omitted) when asset status is processing', () => {
    render(<AssetCard asset={makeAsset({ status: 'processing' })} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });
    // draggable may be "false" or absent; either means not draggable.
    const attr = card.getAttribute('draggable');
    expect(attr === 'false' || attr === null).toBe(true);
  });

  it('sets application/cliptale-asset data on dragstart when ready', () => {
    render(<AssetCard asset={makeAsset()} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: '',
        setData,
      },
    });

    expect(setData).toHaveBeenCalledWith(
      'application/cliptale-asset',
      expect.stringContaining('"id":"asset-001"'),
    );
  });

  it('serializes the full asset object as JSON in dragstart data', () => {
    const asset = makeAsset({ id: 'asset-dnd-001', contentType: 'audio/mpeg' });
    render(<AssetCard asset={asset} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData },
    });

    const [mime, json] = setData.mock.calls[0] as [string, string];
    expect(mime).toBe('application/cliptale-asset');
    const parsed = JSON.parse(json) as { id: string; contentType: string };
    expect(parsed.id).toBe('asset-dnd-001');
    expect(parsed.contentType).toBe('audio/mpeg');
  });

  it('does not call setData on dragstart when asset is not ready', () => {
    render(<AssetCard asset={makeAsset({ status: 'processing' })} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Asset: clip.mp4/ });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData },
    });

    expect(setData).not.toHaveBeenCalled();
  });
});
