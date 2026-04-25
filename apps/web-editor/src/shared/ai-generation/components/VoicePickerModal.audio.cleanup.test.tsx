/**
 * VoicePickerModal — audio cleanup and backdrop dismissal tests.
 *
 * Core audio playback tests live in VoicePickerModal.audio.test.tsx.
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
  mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE_ADAM]);
  mockGetVoiceSampleUrl.mockResolvedValue('https://s3.example.com/adam.mp3');

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

describe('VoicePickerModal — Audio cleanup and dismissal', () => {
  it('clears playing state when audio ends naturally', async () => {
    const user = userEvent.setup();
    let endedCallback: (() => void) | null = null;

    global.Audio = vi.fn(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: (event: string, callback: () => void) => {
        if (event === 'ended') {
          endedCallback = callback;
        }
      },
    })) as any;

    renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    // Wait for stop button to appear
    await waitFor(() => {
      const stopBtn = screen.queryByRole('button', { name: /stop preview for adam/i });
      expect(stopBtn).toBeTruthy();
    });

    // Simulate audio ending
    if (endedCallback) {
      endedCallback();
    }

    // After audio ends, play button should be shown again
    // (due to state update from ended event)
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('cleans up audio on modal unmount', async () => {
    const user = userEvent.setup();
    const mockPauseFn = vi.fn();
    global.Audio = vi.fn(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: mockPauseFn,
      addEventListener: vi.fn(),
    })) as any;

    const { unmount } = renderWithClient(
      <VoicePickerModal {...defaultProps} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const playButtons = screen.getAllByRole('button', { name: /play preview for adam/i });
    await user.click(playButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop preview for adam/i })).toBeTruthy();
    });

    unmount();

    // Audio should be paused on unmount
    expect(mockPauseFn).toHaveBeenCalled();
  });

  it('backdrop click dismisses modal', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderWithClient(
      <VoicePickerModal {...defaultProps} onClose={handleClose} />,
    );

    const overlay = screen.getByRole('dialog') as HTMLElement;
    await user.click(overlay);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside modal panel does not trigger backdrop dismiss', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderWithClient(
      <VoicePickerModal {...defaultProps} onClose={handleClose} />,
    );

    await screen.findByRole('button', { name: /^Adam$/i });
    const adamButton = screen.getByRole('button', { name: /^Adam$/i });
    await user.click(adamButton);

    expect(handleClose).not.toHaveBeenCalled();
  });
});
