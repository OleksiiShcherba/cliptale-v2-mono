/**
 * EnhancePreviewModal tests — 8 cases as specified in the subtask:
 *
 * 1. Not mounted when `open=false`.
 * 2. Renders Before/After text when `status='done'`.
 * 3. Accept click → `onAccept(proposed)` called once.
 * 4. Discard click → `onDiscard` called once.
 * 5. Esc key → `onDiscard`.
 * 6. Backdrop click → `onDiscard`; panel click does not close.
 * 7. `status='failed'` renders `error` and no Accept button.
 * 8. Media-ref blocks render via `renderPromptDocText` (label appears, not UUID).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EnhancePreviewModal } from './EnhancePreviewModal';
import {
  TEXT_ONLY_ORIGINAL,
  TEXT_ONLY_PROPOSED,
  MEDIA_REF_ORIGINAL,
  MEDIA_REF_PROPOSED,
} from './EnhancePreviewModal.fixtures';

// ---------------------------------------------------------------------------
// Helper — renders the modal with sensible defaults
// ---------------------------------------------------------------------------

interface RenderOptions {
  open?: boolean;
  status?: 'idle' | 'queued' | 'running' | 'done' | 'failed';
  proposed?: typeof TEXT_ONLY_PROPOSED | null;
  error?: string | null;
  onAccept?: ReturnType<typeof vi.fn>;
  onDiscard?: ReturnType<typeof vi.fn>;
}

function renderModal({
  open = true,
  status = 'done',
  proposed = TEXT_ONLY_PROPOSED,
  error = null,
  onAccept = vi.fn(),
  onDiscard = vi.fn(),
}: RenderOptions = {}) {
  return render(
    <EnhancePreviewModal
      open={open}
      original={TEXT_ONLY_ORIGINAL}
      proposed={proposed}
      status={status}
      error={error}
      onAccept={onAccept}
      onDiscard={onDiscard}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnhancePreviewModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Case 1 ─────────────────────────────────────────────────────────────────
  it('should not mount any DOM node when open is false', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('enhance-backdrop')).toBeNull();
  });

  // Case 2 ─────────────────────────────────────────────────────────────────
  it('should render Before and After text panels when status is done', () => {
    renderModal({ status: 'done', proposed: TEXT_ONLY_PROPOSED });

    // Before panel contains original text
    const beforeText = screen.getByTestId('enhance-before-text');
    expect(beforeText.textContent).toBe(TEXT_ONLY_ORIGINAL.blocks[0].value);

    // After panel contains proposed text
    const afterText = screen.getByTestId('enhance-after-text');
    expect(afterText.textContent).toBe(TEXT_ONLY_PROPOSED.blocks[0].value);

    // Header is accessible
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('AI Enhanced Prompt')).toBeTruthy();
    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
  });

  // Case 3 ─────────────────────────────────────────────────────────────────
  it('should call onAccept with the proposed doc once when Accept is clicked', () => {
    const onAccept = vi.fn();
    renderModal({ status: 'done', proposed: TEXT_ONLY_PROPOSED, onAccept });

    fireEvent.click(screen.getByTestId('enhance-accept-button'));

    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledWith(TEXT_ONLY_PROPOSED);
  });

  // Case 4 ─────────────────────────────────────────────────────────────────
  it('should call onDiscard once when the Discard button is clicked', () => {
    const onDiscard = vi.fn();
    renderModal({ status: 'done', onDiscard });

    fireEvent.click(screen.getByTestId('enhance-discard-button'));

    expect(onDiscard).toHaveBeenCalledOnce();
  });

  // Case 5 ─────────────────────────────────────────────────────────────────
  it('should call onDiscard when the Escape key is pressed inside the dialog', () => {
    const onDiscard = vi.fn();
    renderModal({ status: 'done', onDiscard });

    const dialog = screen.getByTestId('enhance-dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onDiscard).toHaveBeenCalledOnce();
  });

  // Case 6 ─────────────────────────────────────────────────────────────────
  it('should call onDiscard when the backdrop itself is clicked, but not when a panel is clicked', () => {
    const onDiscard = vi.fn();
    renderModal({ status: 'done', onDiscard });

    // Click the panels area — must NOT trigger onDiscard
    const panels = screen.getByTestId('enhance-panels');
    fireEvent.click(panels);
    expect(onDiscard).not.toHaveBeenCalled();

    // Click the backdrop — MUST trigger onDiscard
    const backdrop = screen.getByTestId('enhance-backdrop');
    fireEvent.click(backdrop);
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  // Case 7 ─────────────────────────────────────────────────────────────────
  it('should show the error message and only a Close button when status is failed', () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    const errorMsg = 'Timed out after 60s';

    renderModal({
      status: 'failed',
      proposed: null,
      error: errorMsg,
      onAccept,
      onDiscard,
    });

    // Error message rendered
    const errorEl = screen.getByTestId('enhance-error');
    expect(errorEl.textContent).toContain(errorMsg);

    // No Accept button
    expect(screen.queryByTestId('enhance-accept-button')).toBeNull();

    // Discard/Close button present with "Close" label
    const discardBtn = screen.getByTestId('enhance-discard-button');
    expect(discardBtn.textContent).toBe('Close');

    // No diff panels
    expect(screen.queryByTestId('enhance-panels')).toBeNull();
  });

  // Case 8 ─────────────────────────────────────────────────────────────────
  it('should render media-ref block as label text, not as a raw UUID', () => {
    render(
      <EnhancePreviewModal
        open={true}
        original={MEDIA_REF_ORIGINAL}
        proposed={MEDIA_REF_PROPOSED}
        status="done"
        error={null}
        onAccept={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const beforeText = screen.getByTestId('enhance-before-text');
    const afterText = screen.getByTestId('enhance-after-text');

    // The human-readable label must appear
    expect(beforeText.textContent).toContain('Rocket Launch');
    expect(afterText.textContent).toContain('Rocket Launch');

    // Raw UUID must NOT appear
    const uuid = '00000000-0000-0000-0000-000000000001';
    expect(beforeText.textContent).not.toContain(uuid);
    expect(afterText.textContent).not.toContain(uuid);

    // Full expected format: "[video: Rocket Launch]"
    expect(beforeText.textContent).toContain('[video: Rocket Launch]');
    expect(afterText.textContent).toContain('[video: Rocket Launch]');
  });
});
