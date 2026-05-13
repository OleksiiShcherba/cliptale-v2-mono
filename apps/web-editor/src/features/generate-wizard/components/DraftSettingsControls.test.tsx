import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PromptDoc } from '@/features/generate-wizard/types';
import { DEFAULT_DRAFT_SETTINGS } from '@/features/generate-wizard/utils';

import { DraftSettingsControls } from './DraftSettingsControls';

const LEGACY_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: '' }],
};

const SETTINGS_DOC: PromptDoc = {
  ...LEGACY_DOC,
  settings: {
    videoLengthSeconds: 60,
    aspectRatio: '9:16',
    styleKey: 'social',
    modelPreference: null,
  },
};

function renderControls(doc: PromptDoc = LEGACY_DOC) {
  const onChange = vi.fn();
  render(<DraftSettingsControls doc={doc} onChange={onChange} />);
  return { onChange };
}

describe('DraftSettingsControls', () => {
  it('renders default settings for legacy PromptDocs', () => {
    renderControls();

    expect((screen.getByRole('spinbutton', { name: 'Video length' }) as HTMLInputElement).value)
      .toBe('30');
    expect(screen.getByRole('button', { name: '30 sec' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '16:9' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement).value)
      .toBe('cinematic');
  });

  it('renders hydrated settings when present', () => {
    renderControls(SETTINGS_DOC);

    expect((screen.getByRole('spinbutton', { name: 'Video length' }) as HTMLInputElement).value)
      .toBe('60');
    expect(screen.getByRole('button', { name: '60 sec' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '9:16' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Style' }) as HTMLSelectElement).value)
      .toBe('social');
  });

  it('updates PromptDoc settings when a custom video length changes', () => {
    const { onChange } = renderControls();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Video length' }), {
      target: { value: '75' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...LEGACY_DOC,
      settings: {
        ...DEFAULT_DRAFT_SETTINGS,
        videoLengthSeconds: 75,
      },
    });
  });

  it('updates PromptDoc settings when a video length preset is selected', () => {
    const { onChange } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: '120 sec' }));

    expect(onChange).toHaveBeenCalledWith({
      ...LEGACY_DOC,
      settings: {
        ...DEFAULT_DRAFT_SETTINGS,
        videoLengthSeconds: 120,
      },
    });
  });

  it('ignores out-of-range custom video lengths', () => {
    const { onChange } = renderControls();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Video length' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Video length' }), {
      target: { value: '601' },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates PromptDoc settings when aspect ratio or style changes', () => {
    const { onChange } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: '1:1' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...LEGACY_DOC,
      settings: {
        ...DEFAULT_DRAFT_SETTINGS,
        aspectRatio: '1:1',
      },
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Style' }), {
      target: { value: 'product' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...LEGACY_DOC,
      settings: {
        ...DEFAULT_DRAFT_SETTINGS,
        aspectRatio: '1:1',
        styleKey: 'product',
      },
    });
  });
});
