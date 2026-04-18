/**
 * VoicePickerModal — audio playback core tests.
 *
 * Audio cleanup (unmount, backdrop dismiss) tests live in
 * VoicePickerModal.audio.cleanup.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ElevenLabsVoice } from '@/shared/ai-generation/types';

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
  mockListUserVoices.mockResolvedValue([]);
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE_ADAM, LIBRARY_VOICE_BELLA]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam.mp3');

  // Mock Audio API
  global.Audio = vi.fn(() => ({
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VoicePickerModal — Audio Playback', () => {
  it('calls getVoiceSampleUrl with voice id and preview url when play button is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    await waitFor(() => {
      expect(mockGetVoiceSampleUrl).toHaveBeenCalledWith(
        LIBRARY_VOICE_ADAM.voiceId,
        LIBRARY_VOICE_ADAM.previewUrl,
      );
    });
  });

  it('creates and plays an Audio object with the presigned URL', async () => {
    const user = userEvent.setup();
    const mockPlayFn = vi.fn().mockResolvedValue(undefined);
    global.Audio = vi.fn(() => ({
      play: mockPlayFn,
      pause: vi.fn(),
      addEventListener: vi.fn(),
    })) as any;

    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    await waitFor(() => {
      expect(mockPlayFn).toHaveBeenCalled();
    });
  });

  it('shows stop icon instead of play icon while audio is playing', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    expect(playButtons[0].textContent).toBe('▶');

    await user.click(playButtons[0]);

    await waitFor(() => {
      const stopButtons = screen.queryAllByRole('button', { name: /stop preview for adam/i });
      expect(stopButtons.length).toBeGreaterThan(0);
    });
  });

  it('stops previous audio when starting playback of a new voice', async () => {
    const user = userEvent.setup();
    const pauseCalls: any[] = [];
    global.Audio = vi.fn(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(() => pauseCalls.push(1)),
      addEventListener: vi.fn(),
    })) as any;

    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    await screen.findByRole('button', { name: /^Bella$/i });

    // Play Adam
    let playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop preview for adam/i })).toBeTruthy();
    });

    // Play Bella (should stop Adam first)
    const bellaPlayButtons = screen.getAllByRole('button', { name: /play preview for bella/i });
    await user.click(bellaPlayButtons[0]);

    // Wait for Bella to start playing
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop preview for bella/i })).toBeTruthy();
    });

    // Verify pause was called (from stopping Adam)
    expect(pauseCalls.length).toBeGreaterThan(0);
  });

  it('stops audio when the stop button is clicked', async () => {
    const user = userEvent.setup();
    const mockPauseFn = vi.fn();
    global.Audio = vi.fn(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: mockPauseFn,
      addEventListener: vi.fn(),
    })) as any;

    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop preview for adam/i })).toBeTruthy();
    });

    const stopButtons = screen.getAllByRole('button', { name: /stop preview for adam/i });
    await user.click(stopButtons[0]);

    await waitFor(() => {
      expect(mockPauseFn).toHaveBeenCalled();
    });
  });

  it('handles audio playback errors gracefully', async () => {
    const user = userEvent.setup();
    global.Audio = vi.fn(() => ({
      play: vi.fn().mockRejectedValue(new Error('Audio play failed')),
      pause: vi.fn(),
      addEventListener: vi.fn(),
    })) as any;

    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    // After error, should show play button again, not stop
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play preview for adam/i })).toBeTruthy();
    });
  });
});
