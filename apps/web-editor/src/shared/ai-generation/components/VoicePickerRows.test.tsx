/**
 * VoicePickerRows — UserVoiceRow tests.
 *
 * LibraryVoiceRow and buildCategoryLabel tests live in
 * VoicePickerRows.library.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserVoice } from '@/shared/ai-generation/types';
import { UserVoiceRow } from './VoicePickerRows';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_VOICE: UserVoice = {
  voiceId: 'uv-001',
  userId: 'user-1',
  label: 'My Custom Voice',
  elevenLabsVoiceId: 'elevenlabs-cloned-001',
  createdAt: '2026-01-01T00:00:00.000Z',
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
