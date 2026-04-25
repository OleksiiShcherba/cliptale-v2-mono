import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/features/version-history/hooks/useAutosave', () => ({
  useAutosave: vi.fn().mockReturnValue({ saveStatus: 'idle', lastSavedAt: null, hasEverEdited: false }),
}));

vi.mock('./SaveStatusBadge', () => ({
  SaveStatusBadge: () => React.createElement('div', { 'data-testid': 'save-status-badge' }),
}));

import { TopBar } from './TopBar';
import { defaultProps } from './TopBar.fixtures';

describe('TopBar — Export button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // ── Integration: Export button disabled before first save ─────────────────

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
