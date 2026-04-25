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
import type { RenderJob } from '@/features/export/types';
import {
  makeHookReturn,
  QUEUED_JOB,
  PROCESSING_JOB,
  COMPLETE_JOB,
  FAILED_JOB,
} from './ExportModal.fixtures';

// ---------------------------------------------------------------------------
// Tests — rendering phases (queued, processing, complete, failed)
// ---------------------------------------------------------------------------

describe('ExportModal phases', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseExportRender.mockReturnValue(makeHookReturn());
  });

  // ── Phase 2: Rendering in progress ────────────────────────────────────────

  it('shows the rendering phase when activeJob status is queued', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: QUEUED_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByTestId('render-progress-bar')).toBeTruthy();
  });

  it('shows the rendering phase when activeJob status is processing', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: PROCESSING_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('renders a disabled Download button during rendering', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: QUEUED_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const downloadButton = screen.getByRole('button', { name: 'Download' });
    expect(downloadButton.hasAttribute('disabled')).toBe(true);
  });

  it('shows the progress percentage when queued', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: { ...QUEUED_JOB, progressPct: 0 }, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('passes progressPct to RenderProgressBar during rendering', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: PROCESSING_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const progressBar = screen.getByTestId('render-progress-bar');
    expect(progressBar.getAttribute('data-progress')).toBe('55');
  });

  // ── Phase 3: Complete ──────────────────────────────────────────────────────

  it('shows the complete phase when activeJob status is complete', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: COMPLETE_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByText('Your video is ready to download.')).toBeTruthy();
  });

  it('renders a Download Video link with the correct href when complete', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: COMPLETE_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const link = screen.getByRole('link', { name: 'Download rendered video' });
    expect(link.getAttribute('href')).toBe('https://example.com/download/job-001.mp4');
  });

  it('shows the progress bar at 100% when complete', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: COMPLETE_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const progressBar = screen.getByTestId('render-progress-bar');
    expect(progressBar.getAttribute('data-progress')).toBe('100');
  });

  // ── Phase 4: Failed ────────────────────────────────────────────────────────

  it('shows the failed phase when activeJob status is failed', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: FAILED_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('FFmpeg crash');
  });

  it('renders a "Try Again" button when export failed', () => {
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: FAILED_JOB, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });

  it('calls reset() when "Try Again" is clicked', () => {
    const reset = vi.fn();
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: FAILED_JOB, activeJobId: 'job-001', reset }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('shows a fallback error message when failed job has no errorMessage', () => {
    const failedNoMsg: RenderJob = { ...FAILED_JOB, errorMessage: null };
    mockUseExportRender.mockReturnValue(
      makeHookReturn({ activeJob: failedNoMsg, activeJobId: 'job-001' }),
    );
    render(<ExportModal versionId={10} onClose={onClose} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('An error occurred during rendering.');
  });
});
