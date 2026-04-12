import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { Asset } from '@/features/asset-manager/types';

const { mockGetAssets } = vi.hoisted(() => ({
  mockGetAssets: vi.fn(),
}));

vi.mock('@/features/asset-manager/api', () => ({
  getAssets: mockGetAssets,
}));

import { AssetPickerField } from './AssetPickerField';

const IMAGE_ASSET: Asset = {
  id: 'asset-img-1',
  projectId: 'proj-1',
  filename: 'sunset.jpg',
  displayName: null,
  contentType: 'image/jpeg',
  downloadUrl: 'https://example.com/sunset.jpg',
  status: 'ready',
  durationSeconds: null,
  width: 1024,
  height: 768,
  fileSizeBytes: 120000,
  thumbnailUri: null,
  waveformPeaks: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

const VIDEO_ASSET: Asset = {
  ...IMAGE_ASSET,
  id: 'asset-vid-1',
  filename: 'intro.mp4',
  contentType: 'video/mp4',
};

const AUDIO_ASSET: Asset = {
  ...IMAGE_ASSET,
  id: 'asset-aud-1',
  filename: 'voiceover.mp3',
  contentType: 'audio/mpeg',
  width: null,
  height: null,
};

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAssets.mockResolvedValue([IMAGE_ASSET, VIDEO_ASSET, AUDIO_ASSET]);
});

describe('AssetPickerField', () => {
  it('renders label and required marker', () => {
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        value={undefined}
        onChange={() => undefined}
        label="Image URL"
        required
      />,
    );
    expect(screen.getByText('Image URL')).toBeTruthy();
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('fires onChange with a single asset id in single mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        value={undefined}
        onChange={handleChange}
        label="Image"
      />,
    );

    await user.click(screen.getByRole('button', { name: /pick an image asset/i }));
    // Wait for asset list to load
    await screen.findByRole('button', { name: /sunset\.jpg/i });
    await user.click(screen.getByRole('button', { name: /sunset\.jpg/i }));

    expect(handleChange).toHaveBeenCalledWith('asset-img-1');
  });

  it('excludes non-image assets from the picker list', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        value={undefined}
        onChange={() => undefined}
        label="Image"
      />,
    );

    await user.click(screen.getByRole('button', { name: /pick an image asset/i }));
    await screen.findByRole('button', { name: /sunset\.jpg/i });
    expect(screen.queryByRole('button', { name: /intro\.mp4/i })).toBeNull();
  });

  it('shows "Pick an audio asset" button when mediaType is audio', () => {
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        mediaType="audio"
        value={undefined}
        onChange={() => undefined}
        label="Source Audio"
      />,
    );
    expect(screen.getByRole('button', { name: /pick an audio asset/i })).toBeTruthy();
  });

  it('shows only audio assets when mediaType is audio', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        mediaType="audio"
        value={undefined}
        onChange={() => undefined}
        label="Source Audio"
      />,
    );
    await user.click(screen.getByRole('button', { name: /pick an audio asset/i }));
    await screen.findByRole('button', { name: /voiceover\.mp3/i });
    expect(screen.queryByRole('button', { name: /sunset\.jpg/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /intro\.mp4/i })).toBeNull();
  });

  it('fires onChange with audio asset id in audio mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="single"
        mediaType="audio"
        value={undefined}
        onChange={handleChange}
        label="Source Audio"
      />,
    );
    await user.click(screen.getByRole('button', { name: /pick an audio asset/i }));
    await screen.findByRole('button', { name: /voiceover\.mp3/i });
    await user.click(screen.getByRole('button', { name: /voiceover\.mp3/i }));
    expect(handleChange).toHaveBeenCalledWith('asset-aud-1');
  });

  it('fires onChange with an array in multi mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <AssetPickerField
        projectId="proj-1"
        mode="multi"
        value={undefined}
        onChange={handleChange}
        label="Image URLs"
      />,
    );

    await user.click(screen.getByRole('button', { name: /add image asset/i }));
    await screen.findByRole('button', { name: /sunset\.jpg/i });
    await user.click(screen.getByRole('button', { name: /sunset\.jpg/i }));

    expect(handleChange).toHaveBeenCalledWith(['asset-img-1']);
  });
});
