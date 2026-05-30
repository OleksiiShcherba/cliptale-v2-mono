/**
 * StoryboardRegenerateConfirmModal — the single confirmation gate for the
 * destructive scene-plan Regenerate (AC-05, AC-08). It enumerates exactly the
 * losses that presently exist (the caller passes only the categories that are
 * actually present — absent ones are omitted), traps focus, and treats
 * Cancel / Escape / backdrop as a no-op cancel. The additive illustration
 * Regenerate does not use this modal.
 */

import React from 'react';

import { storyboardRegenerateConfirmModalStyles as s } from './StoryboardRegenerateConfirmModal.styles';

export type StoryboardRegenerateLossCategory = 'scenes' | 'illustrations' | 'music';

const LOSS_LABEL: Record<StoryboardRegenerateLossCategory, string> = {
  scenes: 'the current scenes and any in-place edits',
  illustrations: 'their generated illustrations',
  music: 'the attached music',
};

interface StoryboardRegenerateConfirmModalProps {
  /** Only the present categories — the workspace omits anything not in the draft. */
  losses: StoryboardRegenerateLossCategory[];
  onConfirm: () => void;
  onCancel: () => void;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

export function StoryboardRegenerateConfirmModal({
  losses,
  onConfirm,
  onCancel,
}: StoryboardRegenerateConfirmModalProps): React.ReactElement {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    const active = document.activeElement;
    const insideDialog = active instanceof Node && dialog.contains(active);
    if (active === dialog || !insideDialog) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCancel();
  };

  return (
    <div
      style={s.backdrop}
      onClick={handleBackdropClick}
      data-testid="storyboard-regenerate-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storyboard-regenerate-modal-title"
        tabIndex={-1}
        style={s.dialog}
        onKeyDown={handleKeyDown}
        data-testid="storyboard-regenerate-modal"
      >
        <h2 id="storyboard-regenerate-modal-title" style={s.title}>
          Regenerate scenes?
        </h2>
        <div style={s.body}>
          Regenerating rebuilds the canvas from a new scene plan. This replaces:
          <ul style={s.lossList}>
            {losses.map((category) => (
              <li
                key={category}
                style={s.lossItem}
                data-testid={`storyboard-regenerate-loss-${category}`}
              >
                {LOSS_LABEL[category]}
              </li>
            ))}
          </ul>
        </div>
        <div style={s.footer}>
          <button
            type="button"
            style={s.cancelButton}
            onClick={onCancel}
            data-testid="storyboard-regenerate-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            style={s.confirmButton}
            onClick={onConfirm}
            data-testid="storyboard-regenerate-confirm-button"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
