import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  StoryboardRegenerateConfirmModal,
  type StoryboardRegenerateLossCategory,
} from './StoryboardRegenerateConfirmModal';

function renderModal(
  overrides: Partial<React.ComponentProps<typeof StoryboardRegenerateConfirmModal>> = {},
) {
  const props = {
    losses: ['scenes', 'illustrations', 'music'] as StoryboardRegenerateLossCategory[],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StoryboardRegenerateConfirmModal {...props} />) };
}

describe('StoryboardRegenerateConfirmModal', () => {
  it('lists exactly the present-loss categories and omits the absent ones (AC-08)', () => {
    renderModal({ losses: ['scenes', 'music'] });
    expect(screen.getByTestId('storyboard-regenerate-loss-scenes')).toBeTruthy();
    expect(screen.getByTestId('storyboard-regenerate-loss-music')).toBeTruthy();
    expect(screen.queryByTestId('storyboard-regenerate-loss-illustrations')).toBeNull();
  });

  it('renders all three categories when all are present', () => {
    renderModal();
    expect(screen.getByTestId('storyboard-regenerate-loss-scenes')).toBeTruthy();
    expect(screen.getByTestId('storyboard-regenerate-loss-illustrations')).toBeTruthy();
    expect(screen.getByTestId('storyboard-regenerate-loss-music')).toBeTruthy();
  });

  it('fires onConfirm when the confirm button is activated (AC-01 destructive path)', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId('storyboard-regenerate-confirm-button'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is activated (AC-05)', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId('storyboard-regenerate-cancel-button'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel on Escape and never onConfirm (AC-05)', () => {
    const { props } = renderModal();
    fireEvent.keyDown(screen.getByTestId('storyboard-regenerate-modal'), { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when the backdrop is clicked, not the dialog body (AC-05)', () => {
    const { props } = renderModal();
    // Clicking inside the dialog must not cancel.
    fireEvent.click(screen.getByTestId('storyboard-regenerate-modal'));
    expect(props.onCancel).not.toHaveBeenCalled();
    // Clicking the backdrop cancels.
    fireEvent.click(screen.getByTestId('storyboard-regenerate-modal-backdrop'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('moves initial focus to the dialog and traps Tab within it', () => {
    renderModal();
    const dialog = screen.getByTestId('storyboard-regenerate-modal');
    const cancel = screen.getByTestId('storyboard-regenerate-cancel-button') as HTMLButtonElement;
    const confirm = screen.getByTestId('storyboard-regenerate-confirm-button') as HTMLButtonElement;

    expect(document.activeElement).toBe(dialog);

    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });
});
