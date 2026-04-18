/**
 * AssetThumbCard — drag-and-drop tests (subtask 6).
 *
 * Verifies that dragging an `AssetThumbCard` fires `dragstart` with the
 * correct MIME type and payload. Visual drag-image fidelity is verified in
 * integration / browser tests; here we assert only the dataTransfer payload.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AssetThumbCard } from './AssetThumbCard';

// ── Mock config and api-client so the component does not require env vars ────

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import type { AssetSummary } from '../types';

function makeVideoAsset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: 'asset-v001',
    type: 'video',
    label: 'clip.mp4',
    durationSeconds: 12.5,
    thumbnailUrl: '/thumb.jpg',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAudioAsset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: 'asset-a001',
    type: 'audio',
    label: 'track.mp3',
    durationSeconds: 30,
    thumbnailUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeImageAsset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: 'asset-i001',
    type: 'image',
    label: 'photo.jpg',
    durationSeconds: null,
    thumbnailUrl: '/img.jpg',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ASSET_DRAG_MIME = 'application/x-cliptale-asset';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetThumbCard / drag-and-drop', () => {
  const onAssetSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has draggable attribute set to true', () => {
    render(<AssetThumbCard asset={makeVideoAsset()} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'clip.mp4' });
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('sets the correct MIME type on dragstart for a video asset', () => {
    render(<AssetThumbCard asset={makeVideoAsset()} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'clip.mp4' });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData, setDragImage: vi.fn() },
    });

    expect(setData).toHaveBeenCalledWith(ASSET_DRAG_MIME, expect.any(String));
  });

  it('encodes assetId, type, and label in the JSON payload for a video asset', () => {
    const asset = makeVideoAsset({ id: 'vid-123', label: 'my-clip.mp4' });
    render(<AssetThumbCard asset={asset} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'my-clip.mp4' });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData, setDragImage: vi.fn() },
    });

    const [mime, json] = setData.mock.calls[0] as [string, string];
    expect(mime).toBe(ASSET_DRAG_MIME);
    const payload = JSON.parse(json) as { assetId: string; type: string; label: string };
    expect(payload.assetId).toBe('vid-123');
    expect(payload.type).toBe('video');
    expect(payload.label).toBe('my-clip.mp4');
  });

  it('encodes assetId, type, and label in the JSON payload for an audio asset', () => {
    const asset = makeAudioAsset({ id: 'aud-456', label: 'beat.mp3' });
    render(<AssetThumbCard asset={asset} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'beat.mp3' });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData, setDragImage: vi.fn() },
    });

    const [, json] = setData.mock.calls[0] as [string, string];
    const payload = JSON.parse(json) as { assetId: string; type: string; label: string };
    expect(payload.assetId).toBe('aud-456');
    expect(payload.type).toBe('audio');
    expect(payload.label).toBe('beat.mp3');
  });

  it('encodes type=image in the payload for an image asset', () => {
    const asset = makeImageAsset({ id: 'img-789', label: 'photo.jpg' });
    render(<AssetThumbCard asset={asset} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'photo.jpg' });

    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { effectAllowed: '', setData, setDragImage: vi.fn() },
    });

    const [, json] = setData.mock.calls[0] as [string, string];
    const payload = JSON.parse(json) as { type: string };
    expect(payload.type).toBe('image');
  });

  it('sets dataTransfer.effectAllowed to copy on dragstart', () => {
    render(<AssetThumbCard asset={makeVideoAsset()} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'clip.mp4' });

    let effectAllowed = '';
    fireEvent.dragStart(card, {
      dataTransfer: {
        get effectAllowed() { return effectAllowed; },
        set effectAllowed(v: string) { effectAllowed = v; },
        setData: vi.fn(),
        setDragImage: vi.fn(),
      },
    });

    expect(effectAllowed).toBe('copy');
  });

  it('still fires onAssetSelected on click (existing behavior preserved)', () => {
    const asset = makeVideoAsset();
    render(<AssetThumbCard asset={asset} onAssetSelected={onAssetSelected} />);
    const card = screen.getByRole('button', { name: 'clip.mp4' });

    fireEvent.click(card);
    expect(onAssetSelected).toHaveBeenCalledOnce();
    expect(onAssetSelected).toHaveBeenCalledWith(asset);
  });
});
