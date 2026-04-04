import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/version-history/hooks/useAutosave', () => ({
  useAutosave: vi.fn().mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false }),
}));

vi.mock('./SaveStatusBadge', () => ({
  SaveStatusBadge: () => React.createElement('div', { 'data-testid': 'save-status-badge' }),
}));

import { TopBar } from './TopBar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  isHistoryOpen: false,
  onToggleHistory: vi.fn(),
  isExportOpen: false,
  onToggleExport: vi.fn(),
  canExport: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders a header landmark with aria-label "Editor top bar"', () => {
    render(<TopBar {...defaultProps} />);
    const header = screen.getByRole('banner');
    expect(header.getAttribute('aria-label')).toBe('Editor top bar');
  });

  it('renders the save status badge', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByTestId('save-status-badge')).toBeTruthy();
  });

  it('renders the History button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Toggle version history' })).toBeTruthy();
  });

  it('renders the Export button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Export video' })).toBeTruthy();
  });

  // ── History button behavior ────────────────────────────────────────────────

  it('calls onToggleHistory when the History button is clicked', () => {
    const onToggleHistory = vi.fn();
    render(<TopBar {...defaultProps} onToggleHistory={onToggleHistory} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle version history' }));
    expect(onToggleHistory).toHaveBeenCalledOnce();
  });

  it('sets aria-pressed="true" on the History button when isHistoryOpen is true', () => {
    render(<TopBar {...defaultProps} isHistoryOpen={true} />);
    const btn = screen.getByRole('button', { name: 'Toggle version history' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed="false" on the History button when isHistoryOpen is false', () => {
    render(<TopBar {...defaultProps} isHistoryOpen={false} />);
    const btn = screen.getByRole('button', { name: 'Toggle version history' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  // ── Export button — enabled state (canExport: true) ───────────────────────

  it('calls onToggleExport when the Export button is clicked and canExport is true', () => {
    const onToggleExport = vi.fn();
    render(<TopBar {...defaultProps} canExport={true} onToggleExport={onToggleExport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
    expect(onToggleExport).toHaveBeenCalledOnce();
  });

  it('does not set aria-disabled on the Export button when canExport is true', () => {
    render(<TopBar {...defaultProps} canExport={true} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('does not set a title tooltip on the Export button when canExport is true', () => {
    render(<TopBar {...defaultProps} canExport={true} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('title')).toBeNull();
  });

  // ── Export button — disabled state (canExport: false) ─────────────────────

  it('does not call onToggleExport when the Export button is clicked and canExport is false', () => {
    const onToggleExport = vi.fn();
    render(<TopBar {...defaultProps} canExport={false} onToggleExport={onToggleExport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
    expect(onToggleExport).not.toHaveBeenCalled();
  });

  it('sets aria-disabled="true" on the Export button when canExport is false', () => {
    render(<TopBar {...defaultProps} canExport={false} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('sets cursor: not-allowed style on the Export button when canExport is false', () => {
    render(<TopBar {...defaultProps} canExport={false} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect((btn as HTMLButtonElement).style.cursor).toBe('not-allowed');
  });

  it('shows tooltip "Save your project first to export." on the Export button when canExport is false', () => {
    render(<TopBar {...defaultProps} canExport={false} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('title')).toBe('Save your project first to export.');
  });
});

// ── App-level integration: Export button disabled before first save ──────────

describe('TopBar Export button — integration with currentVersionId', () => {
  it('has aria-disabled="false" when canExport is true (version exists)', () => {
    render(<TopBar {...defaultProps} canExport={true} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('has aria-disabled="true" when canExport is false (no version yet)', () => {
    render(<TopBar {...defaultProps} canExport={false} />);
    const btn = screen.getByRole('button', { name: 'Export video' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });
});
