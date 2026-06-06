/**
 * Tests for SettingsPage (storyboard-autosave-checkpoints T8, AC-09 / AC-11).
 *
 * Covers:
 * 1. Renders all five interval presets (30 s / 1 / 2 / 5 / 10 min) with the
 *    stored value highlighted after load.
 * 2. Picking another preset PUTs it and shows a saved confirmation; the new
 *    preset becomes the selected one (AC-09).
 * 3. A failed PUT shows a "not saved" message and keeps the previously stored
 *    interval selected (AC-11).
 * 4. A failed GET still renders the page with the default (60 s) — editing is
 *    never blocked by settings load problems.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockFetchMySettings, mockUpdateMySettings } = vi.hoisted(() => ({
  mockFetchMySettings: vi.fn<[], Promise<{ autosaveIntervalSeconds: number; updatedAt: string | null }>>(),
  mockUpdateMySettings: vi.fn<[number], Promise<{ autosaveIntervalSeconds: number; updatedAt: string | null }>>(),
}));

vi.mock('../api', () => ({
  fetchMySettings: mockFetchMySettings,
  updateMySettings: mockUpdateMySettings,
  AUTOSAVE_INTERVAL_PRESETS: [30, 60, 120, 300, 600] as const,
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS: 60,
}));

import { SettingsPage } from './SettingsPage';

function renderPage(): void {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage — presets render with the stored value (AC-09)', () => {
  it('shows all five presets and highlights the stored one', async () => {
    mockFetchMySettings.mockResolvedValue({ autosaveIntervalSeconds: 120, updatedAt: '2026-06-05T10:00:00.000Z' });

    renderPage();

    const selected = await screen.findByRole('radio', { name: /2 minutes/i });
    expect((selected as HTMLInputElement).checked).toBe(true);

    for (const name of [/30 seconds/i, /1 minute$/i, /5 minutes/i, /10 minutes/i]) {
      expect((screen.getByRole('radio', { name }) as HTMLInputElement).checked).toBe(false);
    }
  });

  it('falls back to the 1-minute default when the read fails (never blocks)', async () => {
    mockFetchMySettings.mockRejectedValue(new Error('network'));

    renderPage();

    const fallback = await screen.findByRole('radio', { name: /1 minute$/i });
    expect((fallback as HTMLInputElement).checked).toBe(true);
  });
});

describe('SettingsPage — saving a preset (AC-09)', () => {
  it('PUTs the picked preset and confirms the change', async () => {
    mockFetchMySettings.mockResolvedValue({ autosaveIntervalSeconds: 60, updatedAt: null });
    mockUpdateMySettings.mockResolvedValue({ autosaveIntervalSeconds: 300, updatedAt: '2026-06-05T12:00:00.000Z' });

    renderPage();
    await screen.findByRole('radio', { name: /1 minute$/i });

    await userEvent.click(screen.getByRole('radio', { name: /5 minutes/i }));

    await waitFor(() => {
      expect(mockUpdateMySettings).toHaveBeenCalledWith(300);
    });
    // Confirmation is visible and the new preset is selected.
    expect(await screen.findByText(/saved — applies/i)).toBeTruthy();
    expect((screen.getByRole('radio', { name: /5 minutes/i }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('SettingsPage — failed save keeps the previous value (AC-11)', () => {
  it('shows a not-saved message and keeps the stored interval selected', async () => {
    mockFetchMySettings.mockResolvedValue({ autosaveIntervalSeconds: 120, updatedAt: '2026-06-05T10:00:00.000Z' });
    mockUpdateMySettings.mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByRole('radio', { name: /2 minutes/i });

    await userEvent.click(screen.getByRole('radio', { name: /10 minutes/i }));

    expect(await screen.findByText(/not saved/i)).toBeTruthy();
    // The previously stored interval remains the selected one.
    expect((screen.getByRole('radio', { name: /2 minutes/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /10 minutes/i }) as HTMLInputElement).checked).toBe(false);
  });
});
