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
import { defaultProps } from './TopBar.fixtures';

// ---------------------------------------------------------------------------
// Tests — structure, settings, history, undo/redo, renders, logout
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

  it('renders the Undo button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('renders the Redo button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
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

  // ── Settings button ───────────────────────────────────────────────────────

  it('renders the Settings button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Toggle project settings' })).toBeTruthy();
  });

  it('calls onToggleSettings when the Settings button is clicked', () => {
    const onToggleSettings = vi.fn();
    render(<TopBar {...defaultProps} onToggleSettings={onToggleSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle project settings' }));
    expect(onToggleSettings).toHaveBeenCalledOnce();
  });

  it('sets aria-pressed="true" on the Settings button when isSettingsOpen is true', () => {
    render(<TopBar {...defaultProps} isSettingsOpen={true} />);
    const btn = screen.getByRole('button', { name: 'Toggle project settings' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed="false" on the Settings button when isSettingsOpen is false', () => {
    render(<TopBar {...defaultProps} isSettingsOpen={false} />);
    const btn = screen.getByRole('button', { name: 'Toggle project settings' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
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

  // ── Undo button behavior ──────────────────────────────────────────────────

  it('Undo button is aria-disabled when canUndo is false', () => {
    render(<TopBar {...defaultProps} canUndo={false} />);
    const btn = screen.getByRole('button', { name: 'Undo' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('Undo button is not aria-disabled when canUndo is true', () => {
    render(<TopBar {...defaultProps} canUndo={true} />);
    const btn = screen.getByRole('button', { name: 'Undo' });
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('calls onUndo when Undo button is clicked and canUndo is true', () => {
    const onUndo = vi.fn();
    render(<TopBar {...defaultProps} canUndo={true} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('does not call onUndo when Undo button is clicked and canUndo is false', () => {
    const onUndo = vi.fn();
    render(<TopBar {...defaultProps} canUndo={false} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).not.toHaveBeenCalled();
  });

  // ── Redo button behavior ──────────────────────────────────────────────────

  it('Redo button is aria-disabled when canRedo is false', () => {
    render(<TopBar {...defaultProps} canRedo={false} />);
    const btn = screen.getByRole('button', { name: 'Redo' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('Redo button is not aria-disabled when canRedo is true', () => {
    render(<TopBar {...defaultProps} canRedo={true} />);
    const btn = screen.getByRole('button', { name: 'Redo' });
    expect(btn.getAttribute('aria-disabled')).toBe('false');
  });

  it('calls onRedo when Redo button is clicked and canRedo is true', () => {
    const onRedo = vi.fn();
    render(<TopBar {...defaultProps} canRedo={true} onRedo={onRedo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('does not call onRedo when Redo button is clicked and canRedo is false', () => {
    const onRedo = vi.fn();
    render(<TopBar {...defaultProps} canRedo={false} onRedo={onRedo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(onRedo).not.toHaveBeenCalled();
  });

  // ── Renders button ─────────────────────────────────────────────────────────

  it('renders the Renders button with aria-label "View renders queue"', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'View renders queue' })).toBeTruthy();
  });

  it('calls onToggleRenders when the Renders button is clicked', () => {
    const onToggleRenders = vi.fn();
    render(<TopBar {...defaultProps} onToggleRenders={onToggleRenders} />);
    fireEvent.click(screen.getByRole('button', { name: 'View renders queue' }));
    expect(onToggleRenders).toHaveBeenCalledOnce();
  });

  it('sets aria-pressed="true" on the Renders button when isRendersOpen is true', () => {
    render(<TopBar {...defaultProps} isRendersOpen={true} />);
    const btn = screen.getByRole('button', { name: 'View renders queue' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed="false" on the Renders button when isRendersOpen is false', () => {
    render(<TopBar {...defaultProps} isRendersOpen={false} />);
    const btn = screen.getByRole('button', { name: 'View renders queue' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not show the active renders badge when activeRenderCount is 0', () => {
    render(<TopBar {...defaultProps} activeRenderCount={0} />);
    expect(screen.queryByLabelText(/active render/)).toBeNull();
  });

  it('shows the active renders badge when activeRenderCount is > 0', () => {
    render(<TopBar {...defaultProps} activeRenderCount={2} />);
    expect(screen.getByLabelText(/2 active renders/i)).toBeTruthy();
  });

  it('shows badge count "1" and singular label when activeRenderCount is 1', () => {
    render(<TopBar {...defaultProps} activeRenderCount={1} />);
    expect(screen.getByLabelText(/1 active render/i)).toBeTruthy();
  });

  // ── Logout button ──────────────────────────────────────────────────────────

  it('renders the Sign out button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('calls onLogout when the Sign out button is clicked', () => {
    const onLogout = vi.fn();
    render(<TopBar {...defaultProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
