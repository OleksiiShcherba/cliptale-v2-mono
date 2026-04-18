import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AssetSummary } from '@/shared/ai-generation/api';

const { mockGetContextAssets } = vi.hoisted(() => ({
  mockGetContextAssets: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getContextAssets: mockGetContextAssets,
}));

import { AssetPickerField } from './AssetPickerField';

const IMAGE_ASSET: AssetSummary = {
  id: 'asset-img-1',
  filename: 'sunset.jpg',
  contentType: 'image/jpeg',
  status: 'ready',
};

const VIDEO_ASSET: AssetSummary = {
  id: 'asset-vid-1',
  filename: 'intro.mp4',
  contentType: 'video/mp4',
  status: 'ready',
};

const AUDIO_ASSET: AssetSummary = {
  id: 'asset-aud-1',
  filename: 'voiceover.mp3',
  contentType: 'audio/mpeg',
  status: 'ready',
};

const PROJECT_CTX = { kind: 'project' as const, id: 'proj-1' };
const DRAFT_CTX = { kind: 'draft' as const, id: 'draft-42' };

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContextAssets.mockResolvedValue([IMAGE_ASSET, VIDEO_ASSET, AUDIO_ASSET]);
});

describe('AssetPickerField', () => {
  it('renders label and required marker', () => {
    renderWithClient(
      <AssetPickerField
        context={PROJECT_CTX}
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

  it('fires onChange with a single asset id in single mode (project context)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <AssetPickerField
        context={PROJECT_CTX}
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
    // Confirms project-scoped endpoint is called
    expect(mockGetContextAssets).toHaveBeenCalledWith(PROJECT_CTX);
  });

  it('calls getContextAssets with draft context when kind is draft', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AssetPickerField
        context={DRAFT_CTX}
        mode="single"
        value={undefined}
        onChange={() => undefined}
        label="Image"
      />,
    );

    await user.click(screen.getByRole('button', { name: /pick an image asset/i }));
    await screen.findByRole('button', { name: /sunset\.jpg/i });

    expect(mockGetContextAssets).toHaveBeenCalledWith(DRAFT_CTX);
  });

  it('excludes non-image assets from the picker list', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AssetPickerField
        context={PROJECT_CTX}
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
        context={PROJECT_CTX}
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
        context={PROJECT_CTX}
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
        context={PROJECT_CTX}
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
        context={PROJECT_CTX}
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
