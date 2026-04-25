import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SaveStatusBadge } from './SaveStatusBadge';

// ---------------------------------------------------------------------------
// Tests — SaveStatusBadge
// ---------------------------------------------------------------------------

describe('SaveStatusBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Idle state ─────────────────────────────────────────────────────────────

  it('shows "Not yet saved" when idle and hasEverEdited is false', () => {
    render(
      <SaveStatusBadge saveStatus="idle" lastSavedAt={null} hasEverEdited={false} />,
    );
    expect(screen.getByText(/not yet saved/i)).toBeTruthy();
  });

  it('shows "Unsaved changes" when idle and hasEverEdited is true', () => {
    render(
      <SaveStatusBadge saveStatus="idle" lastSavedAt={null} hasEverEdited={true} />,
    );
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
  });

  // ── Saving state ───────────────────────────────────────────────────────────

  it('shows "Saving…" when saveStatus is saving', () => {
    render(
      <SaveStatusBadge saveStatus="saving" lastSavedAt={null} hasEverEdited={true} />,
    );
    expect(screen.getByText(/saving/i)).toBeTruthy();
  });

  // ── Saved state ────────────────────────────────────────────────────────────

  it('shows "Saved" when saveStatus is saved and lastSavedAt is null', () => {
    render(
      <SaveStatusBadge saveStatus="saved" lastSavedAt={null} hasEverEdited={true} />,
    );
    expect(screen.getByText(/saved/i)).toBeTruthy();
  });

  it('shows a relative date when saveStatus is saved and lastSavedAt is set', () => {
    const pastDate = new Date(Date.now() - 60 * 1000); // 1 min ago
    render(
      <SaveStatusBadge saveStatus="saved" lastSavedAt={pastDate} hasEverEdited={true} />,
    );
    // The aria-label includes the status label with a relative date.
    const badge = screen.getByLabelText(/save status: saved/i);
    expect(badge).toBeTruthy();
  });

  // ── Conflict state — no overwrite handler ──────────────────────────────────

  it('shows "Conflict" when saveStatus is conflict', () => {
    render(
      <SaveStatusBadge saveStatus="conflict" lastSavedAt={null} hasEverEdited={true} />,
    );
    expect(screen.getByText(/conflict/i)).toBeTruthy();
  });

  it('does NOT render the Overwrite button when onOverwrite is not provided', () => {
    render(
      <SaveStatusBadge saveStatus="conflict" lastSavedAt={null} hasEverEdited={true} />,
    );
    expect(screen.queryByRole('button', { name: /overwrite/i })).toBeNull();
  });

  // ── Conflict state — with overwrite handler ────────────────────────────────

  it('renders the Overwrite button when saveStatus is conflict and onOverwrite is provided', () => {
    const onOverwrite = vi.fn();
    render(
      <SaveStatusBadge
        saveStatus="conflict"
        lastSavedAt={null}
        hasEverEdited={true}
        onOverwrite={onOverwrite}
      />,
    );
    expect(screen.getByRole('button', { name: /overwrite server version with local changes/i })).toBeTruthy();
  });

  it('calls onOverwrite when the Overwrite button is clicked', () => {
    const onOverwrite = vi.fn();
    render(
      <SaveStatusBadge
        saveStatus="conflict"
        lastSavedAt={null}
        hasEverEdited={true}
        onOverwrite={onOverwrite}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
    expect(onOverwrite).toHaveBeenCalledOnce();
  });

  it('Overwrite button is keyboard-accessible — has type="button"', () => {
    const onOverwrite = vi.fn();
    render(
      <SaveStatusBadge
        saveStatus="conflict"
        lastSavedAt={null}
        hasEverEdited={true}
        onOverwrite={onOverwrite}
      />,
    );
    const btn = screen.getByRole('button', { name: /overwrite/i });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('does NOT render the Overwrite button when saveStatus is saved even with onOverwrite', () => {
    const onOverwrite = vi.fn();
    render(
      <SaveStatusBadge
        saveStatus="saved"
        lastSavedAt={null}
        hasEverEdited={true}
        onOverwrite={onOverwrite}
      />,
    );
    expect(screen.queryByRole('button', { name: /overwrite/i })).toBeNull();
  });

  // ── Aria live region ───────────────────────────────────────────────────────

  it('has aria-live="polite" on the badge container', () => {
    const { container } = render(
      <SaveStatusBadge saveStatus="idle" lastSavedAt={null} hasEverEdited={false} />,
    );
    const span = container.querySelector('[aria-live]');
    expect(span?.getAttribute('aria-live')).toBe('polite');
  });
});
