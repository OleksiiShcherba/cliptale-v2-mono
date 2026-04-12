import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ElevenLabsVoice, UserVoice } from '@/features/ai-generation/types';
import { UserVoiceRow, LibraryVoiceRow, buildCategoryLabel } from './VoicePickerRows';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_VOICE: UserVoice = {
  voiceId: 'uv-001',
  userId: 'user-1',
  label: 'My Custom Voice',
  elevenLabsVoiceId: 'elevenlabs-cloned-001',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const LIBRARY_VOICE_WITH_LABELS: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam.mp3',
  labels: { gender: 'male', accent: 'american', age: 'middle-aged' },
};

const LIBRARY_VOICE_MINIMAL: ElevenLabsVoice = {
  voiceId: 'xyz123',
  name: 'Simple Voice',
  category: 'premade',
  description: 'A simple voice.',
  previewUrl: 'https://cdn.elevenlabs.io/simple.mp3',
  labels: {},
};

const LIBRARY_VOICE_CUSTOM_CATEGORY: ElevenLabsVoice = {
  voiceId: 'custom-001',
  name: 'Custom Category Voice',
  category: 'custom_cloned',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/custom.mp3',
  labels: { gender: 'female' },
};

describe('UserVoiceRow', () => {
  it('renders voice label as button text', () => {
    render(
      <UserVoiceRow
        voice={USER_VOICE}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: USER_VOICE.label })).toBeTruthy();
  });

  it('shows "cloned" category label', () => {
    render(
      <UserVoiceRow
        voice={USER_VOICE}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('cloned')).toBeTruthy();
  });

  it('sets aria-pressed to true when isSelected is true', () => {
    render(
      <UserVoiceRow
        voice={USER_VOICE}
        isSelected={true}
        onSelect={vi.fn()}
      />,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed to false when isSelected is false', () => {
    render(
      <UserVoiceRow
        voice={USER_VOICE}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(
      <UserVoiceRow
        voice={USER_VOICE}
        isSelected={false}
        onSelect={handleSelect}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleSelect).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryVoiceRow', () => {
  it('renders voice name and category label', () => {
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Adam')).toBeTruthy();
    expect(screen.getByText(/male · american · middle-aged/)).toBeTruthy();
  });

  it('renders play button with correct aria-label when not playing', () => {
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /play preview for adam/i })).toBeTruthy();
  });

  it('renders stop button with correct aria-label when playing', () => {
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={true}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /stop preview for adam/i })).toBeTruthy();
  });

  it('renders play icon when not playing', () => {
    const { container } = render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    const playButtons = screen.getAllByRole('button');
    const playButton = playButtons[playButtons.length - 1]; // Last button is the play button
    expect(playButton.textContent).toBe('▶');
  });

  it('renders stop icon when playing', () => {
    const { container } = render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={true}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    const playButtons = screen.getAllByRole('button');
    const playButton = playButtons[playButtons.length - 1]; // Last button is the play button
    expect(playButton.textContent).toBe('■');
  });

  it('calls onSelect when voice name button is clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={handleSelect}
        onPlayToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Adam' }));
    expect(handleSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onPlayToggle when play button is clicked', async () => {
    const user = userEvent.setup();
    const handlePlayToggle = vi.fn();
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={handlePlayToggle}
      />,
    );

    await user.click(screen.getByRole('button', { name: /play preview for adam/i }));
    expect(handlePlayToggle).toHaveBeenCalledTimes(1);
  });

  it('sets aria-pressed to true when isSelected is true', () => {
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={true}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    const selectButton = screen.getByRole('button', { name: 'Adam' }) as HTMLButtonElement;
    expect(selectButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed to false when isSelected is false', () => {
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={vi.fn()}
        onPlayToggle={vi.fn()}
      />,
    );
    const selectButton = screen.getByRole('button', { name: 'Adam' }) as HTMLButtonElement;
    expect(selectButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not propagate click event when play button is clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handlePlayToggle = vi.fn();
    render(
      <LibraryVoiceRow
        voice={LIBRARY_VOICE_WITH_LABELS}
        isSelected={false}
        isPlaying={false}
        onSelect={handleSelect}
        onPlayToggle={handlePlayToggle}
      />,
    );

    await user.click(screen.getByRole('button', { name: /play preview/i }));
    // Play button should fire, but select should not
    expect(handlePlayToggle).toHaveBeenCalledTimes(1);
    expect(handleSelect).not.toHaveBeenCalled();
  });
});

describe('buildCategoryLabel', () => {
  it('builds label with gender, accent, and age from labels', () => {
    const label = buildCategoryLabel(LIBRARY_VOICE_WITH_LABELS);
    expect(label).toBe('male · american · middle-aged');
  });

  it('skips premade category and only uses labels', () => {
    const label = buildCategoryLabel(LIBRARY_VOICE_MINIMAL);
    expect(label).toBe('premade');
  });

  it('includes custom category if present', () => {
    const label = buildCategoryLabel(LIBRARY_VOICE_CUSTOM_CATEGORY);
    expect(label).toMatch(/custom_cloned/);
    expect(label).toMatch(/female/);
  });

  it('returns null when voice has no labels and category is premade', () => {
    const voice: ElevenLabsVoice = {
      voiceId: 'test',
      name: 'Test',
      category: 'premade',
      description: null,
      previewUrl: 'test.mp3',
      labels: {},
    };
    const label = buildCategoryLabel(voice);
    expect(label).toBe('premade');
  });

  it('returns only category when voice has no labels but category is not premade', () => {
    const voice: ElevenLabsVoice = {
      voiceId: 'test',
      name: 'Test',
      category: 'custom',
      description: null,
      previewUrl: 'test.mp3',
      labels: {},
    };
    const label = buildCategoryLabel(voice);
    expect(label).toBe('custom');
  });

  it('includes only non-empty label values', () => {
    const voice: ElevenLabsVoice = {
      voiceId: 'test',
      name: 'Test',
      category: 'premade',
      description: null,
      previewUrl: 'test.mp3',
      labels: { gender: 'male', accent: undefined, age: undefined },
    };
    const label = buildCategoryLabel(voice);
    expect(label).toBe('male');
  });
});
