import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ElevenLabsVoice, FalFieldSchema } from '@/features/ai-generation/types';

const { mockGetAssets, mockListUserVoices, mockListAvailableVoices, mockGetVoiceSampleUrl } =
  vi.hoisted(() => ({
    mockGetAssets: vi.fn(),
    mockListUserVoices: vi.fn(),
    mockListAvailableVoices: vi.fn(),
    mockGetVoiceSampleUrl: vi.fn(),
  }));

vi.mock('@/features/asset-manager/api', () => ({
  getAssets: mockGetAssets,
}));

vi.mock('@/features/ai-generation/api', () => ({
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

import { SchemaFieldInput } from './SchemaFieldInput';

const LIBRARY_VOICE: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
  labels: { gender: 'male', accent: 'american' },
};

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAssets.mockResolvedValue([]);
  mockListUserVoices.mockResolvedValue([]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam-preview.mp3');
});

describe('SchemaFieldInput', () => {
  it('renders a text input for string fields and reports onChange per keystroke', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'aspect_ratio',
      type: 'string',
      label: 'Aspect Ratio',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput field={field} value="" onChange={handleChange} projectId="p1" />,
    );
    const input = screen.getByLabelText('Aspect Ratio');
    await user.type(input, 'a');
    // The input is fully controlled; each keystroke fires onChange with the
    // new single-character value. Parent state lifts this up in real usage.
    expect(handleChange).toHaveBeenCalledWith('a');
  });

  it('renders a textarea for text fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'prompt',
      type: 'text',
      label: 'Prompt',
      required: true,
    };
    renderWithClient(
      <SchemaFieldInput field={field} value="" onChange={handleChange} projectId="p1" />,
    );
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    await user.type(textarea, 'A');
    expect(handleChange).toHaveBeenCalledWith('A');
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('renders a numeric input for number fields and emits numbers', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'num_images',
      type: 'number',
      label: 'Number of Images',
      required: false,
      min: 1,
      max: 4,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={undefined}
        onChange={handleChange}
        projectId="p1"
      />,
    );
    const input = screen.getByLabelText('Number of Images') as HTMLInputElement;
    expect(input.type).toBe('number');
    await user.type(input, '3');
    expect(handleChange).toHaveBeenLastCalledWith(3);
  });

  it('renders a checkbox for boolean fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'generate_audio',
      type: 'boolean',
      label: 'Generate Audio',
      required: false,
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value={false}
        onChange={handleChange}
        projectId="p1"
      />,
    );
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renders a select for enum fields', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const field: FalFieldSchema = {
      name: 'resolution',
      type: 'enum',
      label: 'Resolution',
      required: true,
      enum: ['360p', '720p', '1080p'],
    };
    renderWithClient(
      <SchemaFieldInput
        field={field}
        value="360p"
        onChange={handleChange}
        projectId="p1"
      />,
    );
    const select = screen.getByLabelText('Resolution') as HTMLSelectElement;
    await user.selectOptions(select, '1080p');
    expect(handleChange).toHaveBeenCalledWith('1080p');
  });

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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
          projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
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
        projectId="p1"
      />,
    );
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });
});
