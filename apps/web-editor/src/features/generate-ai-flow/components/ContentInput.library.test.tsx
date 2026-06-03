/**
 * ContentInput — REAL library-pick integration (AC-16 / US-04).
 *
 * The other ContentInput/Inspector tests mock AssetPickerField + useFileUpload away,
 * which hid a crash: the picker was wired to a placeholder project context
 * (`/projects/__flow__/assets`) whose response is not an array, so `assets.filter`
 * threw. This test renders the REAL AssetPickerField against a stubbed /files
 * endpoint to prove the library-pick path works end-to-end (no throw, fileId written).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FlowBlock } from '@ai-video-editor/project-schema';

// Stub only the HTTP layer — AssetPickerField and getContextAssets run for real.
const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/api-client', () => ({ apiClient: mockApiClient }));

// useFileUpload's network is irrelevant here (we test the pick path); stub its api.
vi.mock('@/shared/file-upload/api');

import { ContentInput } from './ContentInput';
import { clearBulkFileStreamUrlCacheForTests } from '@/shared/hooks/useBulkFileStreamUrls';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function imageAssetBlock(): FlowBlock {
  return {
    blockId: 'c1',
    type: 'content',
    position: { x: 0, y: 0 },
    params: { contentType: 'asset', fileId: '', modality: 'image' },
  };
}

function renderContentInput(onChange: (p: Record<string, unknown>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContentInput block={imageAssetBlock()} onBlockParamsChange={onChange} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBulkFileStreamUrlCacheForTests();
  // GET /files → the Creator's general library (the shape the real endpoint returns).
  mockApiClient.get.mockResolvedValue(
    okResponse({
      items: [
        { id: 'lib-img-1', kind: 'image', mimeType: 'image/png', displayName: 'hero.png', status: 'ready' },
        { id: 'lib-aud-1', kind: 'audio', mimeType: 'audio/mpeg', displayName: 'song.mp3', status: 'ready' },
      ],
      nextCursor: null,
    }),
  );
  // POST /files/stream-urls → presigned preview URLs for the picker thumbnails.
  mockApiClient.post.mockResolvedValue(
    okResponse({ urls: { 'lib-img-1': 'https://cdn.test/lib-img-1.png' }, missingFileIds: [] }),
  );
});

describe('ContentInput — library pick (real AssetPickerField)', () => {
  it('opens the picker against /files and does not crash on assets.filter', async () => {
    renderContentInput(vi.fn());

    // Open the single-select image picker.
    fireEvent.click(screen.getByRole('button', { name: /pick an image asset/i }));

    // The library list loads via GET /files (no /projects/__flow__/... call, no throw).
    await waitFor(() => expect(screen.getByRole('button', { name: /hero\.png/i })).toBeDefined());
    expect(mockApiClient.get).toHaveBeenCalledWith('/files');
  });

  it('writes contentType:asset + the picked fileId onto the block', async () => {
    const onChange = vi.fn();
    renderContentInput(onChange);

    fireEvent.click(screen.getByRole('button', { name: /pick an image asset/i }));
    const pick = await screen.findByRole('button', { name: /hero\.png/i });
    fireEvent.click(pick);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'asset', fileId: 'lib-img-1' }),
    );
  });

  it('clearing the picked asset removes the image (writes an empty fileId)', () => {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ContentInput
          block={{
            blockId: 'c1',
            type: 'content',
            position: { x: 0, y: 0 },
            params: { contentType: 'asset', modality: 'image', fileId: 'lib-img-1' },
          }}
          onBlockParamsChange={onChange}
        />
      </QueryClientProvider>,
    );

    // With an asset set, the single-mode picker shows a value chip + a Clear (×) button.
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'asset', fileId: '' }),
    );
  });

  it('shows a small thumbnail preview for an image asset in the picker', async () => {
    renderContentInput(vi.fn());

    fireEvent.click(screen.getByRole('button', { name: /pick an image asset/i }));

    const thumb = (await screen.findByTestId('asset-thumb-lib-img-1')) as HTMLImageElement;
    expect(thumb.src).toContain('lib-img-1');
    expect(mockApiClient.post).toHaveBeenCalledWith('/files/stream-urls', { fileIds: ['lib-img-1'] });
  });
});
