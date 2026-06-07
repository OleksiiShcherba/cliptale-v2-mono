/**
 * Tests for SettingsPage — concurrency-limit section
 * (storyboard-reference-flows T20, AC-03).
 *
 * AC-03 (rolling window, Creator-configurable): the first generations start in
 * cast order, at most the configured concurrency limit run at once (default 4,
 * bounds 1..12). This section of SettingsPage exposes that setting.
 *
 * Covers:
 * 1. Renders the concurrency-limit input with the stored value after load.
 * 2. Falls back to default (4) when the GET returns no concurrencyLimit.
 * 3. Saving a new value (1..12) calls updateMySettings({ concurrencyLimit })
 *    and shows a saved confirmation.
 * 4. A failed PUT shows a "not saved" message and reverts to the stored value.
 * 5. The input is bounded to 1..12 (min/max attributes present).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockFetchMySettings, mockUpdateMySettings } = vi.hoisted(() => ({
  mockFetchMySettings: vi.fn<
    [],
    Promise<{ autosaveIntervalSeconds: number; concurrencyLimit: number | undefined; updatedAt: string | null }>
  >(),
  mockUpdateMySettings: vi.fn<
    [{ autosaveIntervalSeconds?: number; concurrencyLimit?: number }],
    Promise<{ autosaveIntervalSeconds: number; concurrencyLimit: number; updatedAt: string | null }>
  >(),
}));

vi.mock('../api', () => ({
  fetchMySettings: mockFetchMySettings,
  updateMySettings: mockUpdateMySettings,
  AUTOSAVE_INTERVAL_PRESETS: [30, 60, 120, 300, 600] as const,
  DEFAULT_AUTOSAVE_INTERVAL_SECONDS: 60,
}));

import { SettingsPage } from './SettingsPage';

const DEFAULT_CONCURRENCY_LIMIT = 4;

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

describe('SettingsPage — concurrency limit section (AC-03)', () => {
  it('renders the concurrency-limit input with the stored value from GET', async () => {
    mockFetchMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: 6,
      updatedAt: '2026-06-07T10:00:00.000Z',
    });

    renderPage();

    const input = await screen.findByTestId('concurrency-limit-input');
    expect((input as HTMLInputElement).value).toBe('6');
  });

  it('falls back to default (4) when GET returns no concurrencyLimit', async () => {
    mockFetchMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: undefined,
      updatedAt: null,
    });

    renderPage();

    const input = await screen.findByTestId('concurrency-limit-input');
    expect((input as HTMLInputElement).value).toBe(String(DEFAULT_CONCURRENCY_LIMIT));
  });

  it('calls updateMySettings with the new concurrencyLimit and shows saved confirmation', async () => {
    mockFetchMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: 4,
      updatedAt: null,
    });
    mockUpdateMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: 8,
      updatedAt: '2026-06-07T11:00:00.000Z',
    });

    renderPage();

    const input = await screen.findByTestId('concurrency-limit-input');
    await userEvent.clear(input);
    await userEvent.type(input, '8');
    fireEvent_blur(input);

    await waitFor(() => {
      expect(mockUpdateMySettings).toHaveBeenCalledWith(
        expect.objectContaining({ concurrencyLimit: 8 }),
      );
    });
    expect(await screen.findByTestId('concurrency-limit-saved')).toBeTruthy();
  });

  it('shows a not-saved message and reverts to stored value on PUT failure', async () => {
    mockFetchMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: 4,
      updatedAt: null,
    });
    mockUpdateMySettings.mockRejectedValue(new Error('network'));

    renderPage();

    const input = await screen.findByTestId('concurrency-limit-input');
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    fireEvent_blur(input);

    expect(await screen.findByTestId('concurrency-limit-error')).toBeTruthy();
    // Reverts to the stored value.
    expect((screen.getByTestId('concurrency-limit-input') as HTMLInputElement).value).toBe('4');
  });

  it('renders the input with min=1 and max=12 (AC-03 bounds 1..12)', async () => {
    mockFetchMySettings.mockResolvedValue({
      autosaveIntervalSeconds: 60,
      concurrencyLimit: 4,
      updatedAt: null,
    });

    renderPage();

    const input = await screen.findByTestId('concurrency-limit-input');
    expect((input as HTMLInputElement).min).toBe('1');
    expect((input as HTMLInputElement).max).toBe('12');
  });
});

// Helper to dispatch a blur event — used to trigger save after editing the input.
function fireEvent_blur(element: Element): void {
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}
