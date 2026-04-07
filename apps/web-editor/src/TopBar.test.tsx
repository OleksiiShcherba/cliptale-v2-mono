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
  projectId: 'test-project-001',
  isSettingsOpen: false,
  onToggleSettings: vi.fn(),
  isHistoryOpen: false,
  onToggleHistory: vi.fn(),
  isExportOpen: false,
  onToggleExport: vi.fn(),
  isRendersOpen: false,
  onToggleRenders: vi.fn(),
  activeRenderCount: 0,
  canExport: true,
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
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
    // No badge with accessible label for active renders
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
});
