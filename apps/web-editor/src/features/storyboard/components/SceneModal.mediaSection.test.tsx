/**
 * SceneModal.mediaSection — uploadDraftId threading tests (SB-UPLOAD-2).
 *
 * Covers:
 * (a) When uploadDraftId is provided, AssetPickerModal receives
 *     uploadTarget = { kind: 'draft', draftId: <value> }.
 * (b) When uploadDraftId is absent, AssetPickerModal receives
 *     uploadTarget = undefined.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

// Capture the props passed to the last AssetPickerModal render.
const { capturedPickerProps, mockApiClientGet } = vi.hoisted(() => ({
  capturedPickerProps: { current: null as Record<string, unknown> | null },
  mockApiClientGet: vi.fn(),
}));

vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: (props: Record<string, unknown>) => {
    capturedPickerProps.current = props;
    return (
      <div data-testid="asset-picker-modal" />
    );
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiClientGet },
  buildAuthenticatedUrl: (url: string) => `${url}?token=test`,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { SceneModalMediaSection } from './SceneModal.mediaSection';
import type { ModalMediaItem } from './SceneModal.types';
import type { UploadTarget } from '@/shared/file-upload/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderSection(uploadDraftId?: string) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <SceneModalMediaSection
      items={[] as ModalMediaItem[]}
      onAdd={onAdd}
      onRemove={onRemove}
      uploadDraftId={uploadDraftId}
    />,
  );
  return { onAdd, onRemove };
}

function renderSectionWithItems(items: ModalMediaItem[]) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <SceneModalMediaSection
      items={items}
      onAdd={onAdd}
      onRemove={onRemove}
    />,
  );
  return { onAdd, onRemove };
}

/** Open the picker by clicking Add Media then selecting 'Image'. */
function openPicker(): void {
  fireEvent.click(screen.getByTestId('add-media-button'));
  fireEvent.click(screen.getByTestId('type-chip-image'));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SceneModalMediaSection — uploadDraftId threading', () => {
  beforeEach(() => {
    capturedPickerProps.current = null;
    mockApiClientGet.mockReset();
    mockApiClientGet.mockImplementation((path: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ url: `https://signed.test${path}` }),
    }));
  });

  it('(a) passes uploadTarget with kind=draft when uploadDraftId is provided', () => {
    renderSection('draft-xyz');
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget as UploadTarget | undefined;
    expect(uploadTarget).toEqual({ kind: 'draft', draftId: 'draft-xyz' });
  });

  it('(b) passes uploadTarget=undefined when uploadDraftId is absent', () => {
    renderSection(undefined);
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget;
    expect(uploadTarget).toBeUndefined();
  });

  it('(b2) passes uploadTarget=undefined when uploadDraftId is empty string', () => {
    renderSection('');
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget;
    expect(uploadTarget).toBeUndefined();
  });

  it('renders image media as a preview thumbnail instead of filename only', async () => {
    renderSectionWithItems([
      {
        fileId: 'asset-image-1',
        mediaType: 'image',
        filename: 'Product image',
        sortOrder: 0,
      },
    ]);

    const preview = await screen.findByTestId('media-preview-image') as HTMLImageElement;
    expect(preview.src).toBe('https://signed.test/files/asset-image-1/stream');
    expect(mockApiClientGet).toHaveBeenCalledWith('/files/asset-image-1/stream');
    expect(preview.alt).toBe('image preview for Product image');
    expect(screen.getByText('IMAGE CLIP')).toBeTruthy();
  });

  it('opens a full image preview modal from an image media thumbnail', async () => {
    renderSectionWithItems([
      {
        fileId: 'asset-image-1',
        mediaType: 'image',
        filename: 'Product image',
        sortOrder: 0,
      },
    ]);

    fireEvent.click(await screen.findByTestId('media-preview-button'));

    const lightboxImage = screen.getByTestId('media-lightbox-image') as HTMLImageElement;
    expect(lightboxImage.src).toBe('https://signed.test/files/asset-image-1/stream');
    expect(lightboxImage.alt).toBe('image preview for Product image');

    fireEvent.click(screen.getByTestId('media-lightbox-close'));
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
  });

  it('keeps keyboard focus inside the media preview modal', async () => {
    renderSectionWithItems([
      {
        fileId: 'asset-image-1',
        mediaType: 'image',
        filename: 'Product image',
        sortOrder: 0,
      },
    ]);

    fireEvent.click(await screen.findByTestId('media-preview-button'));

    const lightbox = screen.getByTestId('media-lightbox');
    const closeButton = screen.getByTestId('media-lightbox-close');

    expect(document.activeElement).toBe(lightbox);
    fireEvent.keyDown(lightbox, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
  });

  it('renders video media via thumbnail endpoint', () => {
    renderSectionWithItems([
      {
        fileId: 'asset-video-1',
        mediaType: 'video',
        filename: 'Product reel',
        sortOrder: 0,
      },
    ]);

    const preview = screen.getByTestId('media-preview-image') as HTMLImageElement;
    expect(preview.src).toBe('http://localhost:3001/assets/asset-video-1/thumbnail?token=test');
    expect(preview.alt).toBe('video preview for Product reel');
  });

  it('opens a full video preview modal from a video media thumbnail', () => {
    renderSectionWithItems([
      {
        fileId: 'asset-video-1',
        mediaType: 'video',
        filename: 'Product reel',
        sortOrder: 0,
      },
    ]);

    fireEvent.click(screen.getByTestId('media-preview-button'));

    const lightboxVideo = screen.getByTestId('media-lightbox-video') as HTMLVideoElement;
    expect(lightboxVideo.src).toBe('http://localhost:3001/assets/asset-video-1/stream?token=test');

    fireEvent.keyDown(screen.getByTestId('media-lightbox'), { key: 'Escape' });
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
  });

  it('keeps a compact placeholder for audio media', () => {
    renderSectionWithItems([
      {
        fileId: 'asset-audio-1',
        mediaType: 'audio',
        filename: 'Voiceover',
        sortOrder: 0,
      },
    ]);

    expect(screen.getByTestId('media-preview-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('media-preview-image')).toBeNull();
    expect(screen.queryByTestId('media-preview-button')).toBeNull();
    expect(screen.getByText('AUDIO CLIP')).toBeTruthy();
  });
});
