import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: (_date: Date) => '5m ago',
}));

import { RestoreModal } from './RestoreModal';
import type { VersionSummary } from '@/features/version-history/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSION: VersionSummary = {
  versionId: 11,
  createdAt: '2026-04-03T11:52:00.000Z',
  createdByUserId: 'user-1',
  durationFrames: 290,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof RestoreModal>> = {}) {
  const defaults = {
    version: VERSION,
    isRestoring: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(<RestoreModal {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RestoreModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders the modal title', () => {
    renderModal();
    expect(screen.getByText('Restore Version')).toBeTruthy();
  });

  it('renders the description with relative time', () => {
    renderModal();
    expect(screen.getByText(/5m ago/)).toBeTruthy();
  });

  it('renders the version ID', () => {
    renderModal();
    expect(screen.getByText('#11')).toBeTruthy();
  });

  it('renders Cancel and Restore buttons', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Cancel restore' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore version 11' })).toBeTruthy();
  });

  it('shows "Restore" text on the confirm button when not restoring', () => {
    renderModal({ isRestoring: false });
    const btn = screen.getByRole('button', { name: 'Restore version 11' });
    expect(btn.textContent).toBe('Restore');
  });

  it('shows "Restoring…" text on the confirm button when restoring', () => {
    renderModal({ isRestoring: true });
    const btn = screen.getByRole('button', { name: 'Restore version 11' });
    expect(btn.textContent).toBe('Restoring\u2026');
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has role="dialog" on the overlay wrapper', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('has aria-modal="true"', () => {
    renderModal();
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  it('has aria-labelledby pointing to the title', () => {
    renderModal();
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('restore-modal-title');
  });

  it('has aria-describedby pointing to the description', () => {
    renderModal();
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe('restore-modal-desc');
  });

  it('timestamp span has title attribute with absolute ISO time', () => {
    renderModal();
    const span = screen.getByText('5m ago');
    expect(span.getAttribute('title')).toBe('2026-04-03T11:52:00.000Z');
  });

  // -------------------------------------------------------------------------
  // Interactions
  // -------------------------------------------------------------------------

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel restore' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onConfirm when Restore is clicked', () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 11' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when overlay backdrop is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCancel when modal content area is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    fireEvent.click(screen.getByText('Restore Version'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Disabled state during restore
  // -------------------------------------------------------------------------

  it('disables Cancel button while restoring', () => {
    renderModal({ isRestoring: true });
    const btn = screen.getByRole('button', { name: 'Cancel restore' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables Restore button while restoring', () => {
    renderModal({ isRestoring: true });
    const btn = screen.getByRole('button', { name: 'Restore version 11' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('buttons are enabled when not restoring', () => {
    renderModal({ isRestoring: false });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel restore' }) as HTMLButtonElement;
    const restoreBtn = screen.getByRole('button', { name: 'Restore version 11' }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(false);
    expect(restoreBtn.disabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('renders correctly with null durationFrames', () => {
    const versionNoDuration: VersionSummary = { ...VERSION, durationFrames: null };
    renderModal({ version: versionNoDuration });
    expect(screen.getByText('Restore Version')).toBeTruthy();
  });

  it('renders correctly with null createdByUserId', () => {
    const versionNoUser: VersionSummary = { ...VERSION, createdByUserId: null };
    renderModal({ version: versionNoUser });
    expect(screen.getByText('#11')).toBeTruthy();
  });
});
