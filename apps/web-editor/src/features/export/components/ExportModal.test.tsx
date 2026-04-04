import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseExportRender } = vi.hoisted(() => ({
  mockUseExportRender: vi.fn(),
}));

vi.mock('@/features/export/hooks/useExportRender', () => ({
  useExportRender: (...args: unknown[]) => mockUseExportRender(...args),
}));

vi.mock('./RenderProgressBar', () => ({
  RenderProgressBar: ({ progressPct, label }: { progressPct: number; label?: string }) =>
    React.createElement('div', {
      'data-testid': 'render-progress-bar',
      'data-progress': progressPct,
      'data-label': label,
    }),
}));

import { ExportModal } from './ExportModal';
import { makeHookReturn, QUEUED_JOB, FAILED_JOB, COMPLETE_JOB } from './ExportModal.fixtures';

// ---------------------------------------------------------------------------
// Tests — structure, preset selection, close/cancel
// ---------------------------------------------------------------------------

describe('ExportModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseExportRender.mockReturnValue(makeHookReturn());
  });

  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders a dialog with aria-label "Export video"', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Export video' })).toBeTruthy();
  });

  it('renders the heading "Export Video"', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Export Video' })).toBeTruthy();
  });

  it('renders a close button with aria-label "Close export modal"', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Close export modal' })).toBeTruthy();
  });

  it('renders a backdrop element with aria-hidden', () => {
    const { container } = render(<ExportModal versionId={10} onClose={onClose} />);
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
  });

  it('passes versionId to useExportRender', () => {
    render(<ExportModal versionId={42} onClose={onClose} />);
    expect(mockUseExportRender).toHaveBeenCalledWith(42);
  });

  // ── Phase 1: Preset selection ──────────────────────────────────────────────

  it('shows the preset selection phase by default', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('radiogroup', { name: 'Select render preset' })).toBeTruthy();
  });

  it('renders 6 preset radio buttons', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(6);
  });

  it('renders the "Start Export" button disabled when no preset is selected', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    const startButton = screen.getByRole('button', { name: 'Start Export' });
    expect(startButton).toBeTruthy();
    expect(startButton.hasAttribute('disabled')).toBe(true);
  });

  it('marks a preset card as aria-checked after clicking it', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    const card1080p = screen.getByRole('radio', { name: /1080p Full HD/i });
    fireEvent.click(card1080p);
    expect(card1080p.getAttribute('aria-checked')).toBe('true');
  });

  it('enables the Start Export button after a preset is selected', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /1080p Full HD/i }));
    const startButton = screen.getByRole('button', { name: 'Start Export' });
    expect(startButton.hasAttribute('disabled')).toBe(false);
  });

  it('calls startRender with the selected presetKey when Start Export is clicked', () => {
    const startRender = vi.fn().mockResolvedValue(undefined);
    mockUseExportRender.mockReturnValue(makeHookReturn({ startRender }));

    render(<ExportModal versionId={10} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /720p HD/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Export' }));

    expect(startRender).toHaveBeenCalledWith('720p');
  });

  it('shows "Starting…" on the button while isSubmitting is true', () => {
    mockUseExportRender.mockReturnValue(makeHookReturn({ isSubmitting: true }));
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByText('Starting\u2026')).toBeTruthy();
  });

  it('displays an error alert when error is present in preset selection phase', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ error: new Error('Service unavailable') }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Service unavailable');
  });

  // ── Close / Cancel ─────────────────────────────────────────────────────────

  it('calls onClose and reset() when the close button is clicked', () => {
    const reset = vi.fn();
    mockUseExportRender.mockReturnValue(makeHookReturn({ reset }));
    render(<ExportModal versionId={10} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close export modal' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose and reset() when the footer Cancel button is clicked', () => {
    const reset = vi.fn();
    mockUseExportRender.mockReturnValue(makeHookReturn({ reset }));
    render(<ExportModal versionId={10} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose and reset() when the backdrop is clicked', () => {
    const reset = vi.fn();
    mockUseExportRender.mockReturnValue(makeHookReturn({ reset }));
    const { container } = render(<ExportModal versionId={10} onClose={onClose} />);
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(reset).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows "Cancel" in the footer button during preset selection', () => {
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('shows "Close" in the footer button when complete', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: COMPLETE_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
