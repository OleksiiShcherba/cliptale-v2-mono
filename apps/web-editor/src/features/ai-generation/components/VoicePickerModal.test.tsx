import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ElevenLabsVoice, UserVoice } from '@/features/ai-generation/types';

const { mockListUserVoices, mockListAvailableVoices, mockGetVoiceSampleUrl } = vi.hoisted(() => ({
  mockListUserVoices: vi.fn(),
  mockListAvailableVoices: vi.fn(),
  mockGetVoiceSampleUrl: vi.fn(),
}));

vi.mock('@/features/ai-generation/api', () => ({
  listUserVoices: mockListUserVoices,
  listAvailableVoices: mockListAvailableVoices,
  getVoiceSampleUrl: mockGetVoiceSampleUrl,
}));

import { VoicePickerModal } from './VoicePickerModal';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LIBRARY_VOICE_ADAM: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam.mp3',
  labels: { gender: 'male', accent: 'american', age: 'middle-aged' },
};

const LIBRARY_VOICE_BELLA: ElevenLabsVoice = {
  voiceId: 'EXAVITQu4vr4xnSDxMaL',
  name: 'Bella',
  category: 'premade',
  description: 'Warm and clear.',
  previewUrl: 'https://cdn.elevenlabs.io/bella.mp3',
  labels: { gender: 'female', accent: 'british' },
};

const USER_VOICE_CUSTOM: UserVoice = {
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

const defaultProps = {
  value: undefined,
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListUserVoices.mockResolvedValue([USER_VOICE_CUSTOM]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE_ADAM, LIBRARY_VOICE_BELLA]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam.mp3');
});

describe('VoicePickerModal', () => {
  it('renders with dialog role and accessible label', () => {
    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );
    expect(screen.getByRole('dialog', { name: /select a voice/i })).toBeTruthy();
  });

  it('renders both section headings', () => {
    renderWithClient(<VoicePickerModal {...defaultProps} />);
    expect(screen.getByRole('region', { name: /your voices/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /elevenlabs library/i })).toBeTruthy();
  });

  it('renders library voices after loading', async () => {
    renderWithClient(<VoicePickerModal {...defaultProps} />);
    await screen.findByRole('button', { name: /^Adam$/i });
    await screen.findByRole('button', { name: /^Bella$/i });
  });

  it('renders user voices after loading', async () => {
    renderWithClient(<VoicePickerModal {...defaultProps} />);
    await screen.findByRole('button', { name: /my custom voice/i });
  });

  it('shows loading text while voices are being fetched', () => {
    // Make queries hang so loading state is visible
    mockListUserVoices.mockReturnValue(new Promise(() => undefined));
    mockListAvailableVoices.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<VoicePickerModal {...defaultProps} />);
    expect(screen.getByText(/loading your voices/i)).toBeTruthy();
    expect(screen.getByText(/loading voice library/i)).toBeTruthy();
  });

  it('shows error message when user voices fetch fails', async () => {
    mockListUserVoices.mockRejectedValue(new Error('Network error'));

    renderWithClient(<VoicePickerModal {...defaultProps} />);
    await screen.findByText(/could not load your voices/i);
  });

  it('shows error message when library voices fetch fails', async () => {
    mockListAvailableVoices.mockRejectedValue(new Error('Network error'));

    renderWithClient(<VoicePickerModal {...defaultProps} />);
    await screen.findByText(/could not load the voice library/i);
  });

  it('shows empty state when user has no cloned voices', async () => {
    mockListUserVoices.mockResolvedValue([]);

    renderWithClient(<VoicePickerModal {...defaultProps} />);
    await screen.findByText(/no cloned voices yet/i);
  });

  it('calls onSelect with voice_id when a library voice is confirmed', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    renderWithClient(
      <VoicePickerModal {...defaultProps} onSelect={handleSelect} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    await user.click(screen.getByRole('button', { name: /^Adam$/i }));
    await user.click(screen.getByRole('button', { name: /use this voice/i }));

    expect(handleSelect).toHaveBeenCalledWith(LIBRARY_VOICE_ADAM.voiceId);
  });

  it('calls onSelect with elevenLabsVoiceId when a user voice is confirmed', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    renderWithClient(
      <VoicePickerModal {...defaultProps} onSelect={handleSelect} />,
    );

    await screen.findByRole('button', { name: /my custom voice/i });
    await user.click(screen.getByRole('button', { name: /my custom voice/i }));
    await user.click(screen.getByRole('button', { name: /use this voice/i }));

    expect(handleSelect).toHaveBeenCalledWith(USER_VOICE_CUSTOM.elevenLabsVoiceId);
  });

  it('disables "Use this voice" button when no voice is selected', () => {
    renderWithClient(<VoicePickerModal {...defaultProps} value={undefined} />);
    const confirmBtn = screen.getByRole('button', { name: /use this voice/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('enables "Use this voice" button when a voice is pre-selected via value prop', async () => {
    renderWithClient(
      <VoicePickerModal {...defaultProps} value={LIBRARY_VOICE_ADAM.voiceId} />,
    );
    // Even before query resolves, the pendingVoiceId is seeded from value prop
    const confirmBtn = screen.getByRole('button', { name: /use this voice/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderWithClient(<VoicePickerModal {...defaultProps} onClose={handleClose} />);

    await user.click(screen.getByRole('button', { name: /close voice picker/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderWithClient(<VoicePickerModal {...defaultProps} onClose={handleClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('filters library voices by search query', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePickerModal {...defaultProps} />);

    await screen.findByRole('button', { name: /^Adam$/i });
    await screen.findByRole('button', { name: /^Bella$/i });

    const searchInput = screen.getByRole('searchbox', { name: /search voices/i });
    await user.type(searchInput, 'bell');

    expect(screen.queryByRole('button', { name: /^Adam$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^Bella$/i })).toBeTruthy();
  });

  it('filters user voices by search query', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePickerModal {...defaultProps} />);

    await screen.findByRole('button', { name: /my custom voice/i });

    const searchInput = screen.getByRole('searchbox', { name: /search voices/i });
    await user.type(searchInput, 'nonexistent');

    expect(screen.queryByRole('button', { name: /my custom voice/i })).toBeNull();
    // Both sections show the empty-search message when nothing matches.
    const noMatchTexts = screen.getAllByText(/no voices match your search/i);
    expect(noMatchTexts.length).toBeGreaterThan(0);
  });

  it('shows "No voices match your search" in library section when search has no results', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePickerModal {...defaultProps} />);

    await screen.findByRole('button', { name: /^Adam$/i });
    const searchInput = screen.getByRole('searchbox', { name: /search voices/i });
    await user.type(searchInput, 'zzz');

    const noMatchTexts = screen.getAllByText(/no voices match your search/i);
    expect(noMatchTexts.length).toBeGreaterThan(0);
  });

  it('marks voice row as pressed when selected', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePickerModal {...defaultProps} />);

    await screen.findByRole('button', { name: /^Adam$/i });
    await user.click(screen.getByRole('button', { name: /^Adam$/i }));

    const adamBtn = screen.getByRole('button', { name: /^Adam$/i }) as HTMLButtonElement;
    expect(adamBtn.getAttribute('aria-pressed')).toBe('true');
  });
});
