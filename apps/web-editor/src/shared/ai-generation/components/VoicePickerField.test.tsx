import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ElevenLabsVoice, UserVoice } from '@/shared/ai-generation/types';

const { mockListUserVoices, mockListAvailableVoices, mockGetVoiceSampleUrl } = vi.hoisted(() => ({
  mockListUserVoices: vi.fn(),
  mockListAvailableVoices: vi.fn(),
  mockGetVoiceSampleUrl: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

import { VoicePickerField } from './VoicePickerField';

const LIBRARY_VOICE: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam-preview.mp3',
  labels: { gender: 'male', accent: 'american' },
};

const USER_VOICE: UserVoice = {
  voiceId: 'uv-001',
  userId: 'user-1',
  label: 'My Custom Voice',
  elevenLabsVoiceId: 'elevenlabs-cloned-001',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListUserVoices.mockResolvedValue([USER_VOICE]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam-preview.mp3');
});

describe('VoicePickerField', () => {
  it('renders label and "Select a voice…" trigger when value is undefined', () => {
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={() => undefined}
        label="Voice"
      />,
    );
    expect(screen.getByText('Voice')).toBeTruthy();
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });

  it('renders required asterisk when required=true', () => {
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={() => undefined}
        label="Voice"
        required
      />,
    );
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('renders description text when provided', () => {
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={() => undefined}
        label="Voice"
        description="Pick a voice for the output."
      />,
    );
    expect(screen.getByText('Pick a voice for the output.')).toBeTruthy();
  });

  it('opens VoicePickerModal when the trigger button is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={() => undefined}
        label="Voice"
      />,
    );
    await user.click(screen.getByRole('button', { name: /select a voice/i }));
    expect(screen.getByRole('dialog', { name: /select a voice/i })).toBeTruthy();
  });

  it('shows selected voice name from library when value matches a library voice', async () => {
    renderWithClient(
      <VoicePickerField
        value={LIBRARY_VOICE.voiceId}
        onChange={() => undefined}
        label="Voice"
      />,
    );
    // Wait for the query to resolve and name to appear
    await screen.findByText('Adam');
    expect(screen.queryByRole('button', { name: /select a voice/i })).toBeNull();
  });

  it('shows selected voice name from user voices when value matches a cloned voice', async () => {
    renderWithClient(
      <VoicePickerField
        value={USER_VOICE.elevenLabsVoiceId}
        onChange={() => undefined}
        label="Voice"
      />,
    );
    await screen.findByText('My Custom Voice');
    expect(screen.queryByRole('button', { name: /select a voice/i })).toBeNull();
  });

  it('calls onChange with undefined when the clear button is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <VoicePickerField
        value={LIBRARY_VOICE.voiceId}
        onChange={handleChange}
        label="Voice"
      />,
    );
    await screen.findByText('Adam');
    await user.click(screen.getByRole('button', { name: /clear voice/i }));
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with voiceId when a voice is selected in the modal', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={handleChange}
        label="Voice"
      />,
    );

    await user.click(screen.getByRole('button', { name: /select a voice/i }));
    // Wait for library voices to load in the modal
    await screen.findByRole('button', { name: /^Adam$/i });
    await user.click(screen.getByRole('button', { name: /^Adam$/i }));
    await user.click(screen.getByRole('button', { name: /use this voice/i }));

    expect(handleChange).toHaveBeenCalledWith(LIBRARY_VOICE.voiceId);
  });

  it('closes the modal without calling onChange when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithClient(
      <VoicePickerField
        value={undefined}
        onChange={handleChange}
        label="Voice"
      />,
    );

    await user.click(screen.getByRole('button', { name: /select a voice/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('shows "Select a voice…" trigger when value is set but not found in either list', () => {
    mockListUserVoices.mockResolvedValue([]);
    mockListAvailableVoices.mockResolvedValue([]);

    renderWithClient(
      <VoicePickerField
        value="unknown-voice-id"
        onChange={() => undefined}
        label="Voice"
      />,
    );
    // When voice cannot be resolved, the empty trigger is still shown
    expect(screen.getByRole('button', { name: /select a voice/i })).toBeTruthy();
  });
});
