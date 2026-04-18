/**
 * SchemaFieldInput — complex field type tests.
 *
 * Covers: image_url, image_url_list, audio_url, audio_upload, string_list,
 * and voice_picker fields.
 *
 * Simple primitive field tests (string, text, number, boolean, enum) live in
 * SchemaFieldInput.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { FalFieldSchema } from '@/shared/ai-generation/types';
import { LIBRARY_VOICE } from './SchemaFieldInput.fixtures';

const {
  mockGetContextAssets,
  mockListUserVoices,
  mockListAvailableVoices,
  mockGetVoiceSampleUrl,
} = vi.hoisted(() => ({
  mockGetContextAssets: vi.fn(),
  mockListUserVoices: vi.fn(),
  mockListAvailableVoices: vi.fn(),
  mockGetVoiceSampleUrl: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  getContextAssets: mockGetContextAssets,
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

import { SchemaFieldInput } from './SchemaFieldInput';

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PROJECT_CTX = { kind: 'project' as const, id: 'p1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContextAssets.mockResolvedValue([]);
  mockListUserVoices.mockResolvedValue([]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam-preview.mp3');
});

describe('SchemaFieldInput — complex fields', () => {
  it('renders the AssetPickerField for image_url fields (single mode)', () => {
    const field: FalFieldSchema = {
      name: 'image_url',
      type: 'image_url',
      label: 'Image URL',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByRole('button', { name: /pick an image asset/i })).toBeTruthy();
  });

  it('renders the AssetPickerField for image_url_list fields (multi mode)', () => {
    const field: FalFieldSchema = {
      name: 'image_urls',
      type: 'image_url_list',
      label: 'Image URLs',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByRole('button', { name: /add image asset/i })).toBeTruthy();
  });

  it('renders the AssetPickerField for audio_url fields (audio mode, single)', () => {
    const field: FalFieldSchema = {
      name: 'source_audio',
      type: 'audio_url',
      label: 'Source Audio',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByRole('button', { name: /pick an audio asset/i })).toBeTruthy();
  });

  it('renders a file input for audio_upload fields and fires onChange with the File', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'audio_sample',
      type: 'audio_upload',
      label: 'Audio Sample',
      required: true,
      description: 'Upload a WAV or MP3.',
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByText('Audio Sample')).toBeTruthy();
    expect(screen.getByText('Upload a WAV or MP3.')).toBeTruthy();
    const fileInput = screen.getByLabelText('Audio Sample') as HTMLInputElement;
    expect(fileInput.type).toBe('file');
    const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
    await user.upload(fileInput, file);
    expect(handleChange).toHaveBeenCalledWith(file);
  });

  it('renders repeating inputs for string_list fields and allows add/remove', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'multi_prompt',
      type: 'string_list',
      label: 'Multi Prompt',
      required: false,
    };
    const { rerender } = renderWithClient(
      <SchemaFieldInput
        field={field}
        value={['first shot']}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    expect((screen.getByLabelText('Multi Prompt 1') as HTMLInputElement).value).toBe('first shot');

    await user.click(screen.getByRole('button', { name: /\+ add/i }));
    expect(handleChange).toHaveBeenLastCalledWith(['first shot', '']);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SchemaFieldInput
          field={field}
          value={['first', 'second']}
          onChange={handleChange}
          context={PROJECT_CTX}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Multi Prompt 1' }));
    expect(handleChange).toHaveBeenLastCalledWith(['second']);
  });

  it('renders VoicePickerField for voice_picker fields with "Select a voice…" trigger when no value', () => {
    const field: FalFieldSchema = {
      name: 'voice_id',
      type: 'voice_picker',
      label: 'Voice',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByText('Voice')).toBeTruthy();
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });

  it('renders VoicePickerField for voice_picker fields and shows resolved voice name', async () => {
    const field: FalFieldSchema = {
      name: 'voice_id',
      type: 'voice_picker',
      label: 'Voice',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={LIBRARY_VOICE.voiceId}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    await screen.findByText('Adam');
    expect(screen.queryByRole('button', { name: /select a voice/i })).toBeNull();
  });

  it('calls onChange with selected voiceId when voice is picked via VoicePickerField', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'voice_id',
      type: 'voice_picker',
      label: 'Voice',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    await user.click(screen.getByRole('button', { name: /select a voice/i }));
    await screen.findByRole('dialog', { name: /select a voice/i });
    await screen.findByRole('button', { name: /^Adam$/i });
    await user.click(screen.getByRole('button', { name: /^Adam$/i }));
    await user.click(screen.getByRole('button', { name: /use this voice/i }));
    expect(handleChange).toHaveBeenCalledWith(LIBRARY_VOICE.voiceId);
  });

  it('calls onChange with undefined when the clear button is clicked on voice_picker', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'voice_id',
      type: 'voice_picker',
      label: 'Voice',
      required: false,
      description: 'Choose the output voice.',
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={LIBRARY_VOICE.voiceId}
        onChange={handleChange}
        context={PROJECT_CTX}
      />,
    );
    await screen.findByText('Adam');
    expect(screen.getByText('Choose the output voice.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /clear voice/i }));
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it('treats a non-string value as undefined for voice_picker and renders the empty trigger', () => {
    const field: FalFieldSchema = {
      name: 'voice_id',
      type: 'voice_picker',
      label: 'Voice',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={42}
        onChange={() => undefined}
        context={PROJECT_CTX}
      />,
    );
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });
});
