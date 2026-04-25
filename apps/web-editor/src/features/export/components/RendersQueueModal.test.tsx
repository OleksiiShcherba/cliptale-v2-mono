import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseListRenders } = vi.hoisted(() => ({
  mockUseListRenders: vi.fn(),
}));

vi.mock('@/features/export/hooks/useListRenders', () => ({
  useListRenders: (...args: unknown[]) => mockUseListRenders(...args),
}));

import { RendersQueueModal } from './RendersQueueModal';
import type { RenderJob } from '@/features/export/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const QUEUED_JOB: RenderJob = {
  jobId: 'job-001',
  projectId: 'proj-001',
  versionId: 5,
  status: 'queued',
  progressPct: 0,
  preset: { key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  outputUri: null,
  errorMessage: null,
  createdAt: '2026-04-07T09:00:00.000Z',
  updatedAt: '2026-04-07T09:00:00.000Z',
};

const PROCESSING_JOB: RenderJob = { ...QUEUED_JOB, jobId: 'job-002', status: 'processing', progressPct: 55 };

const COMPLETE_JOB: RenderJob = {
  ...QUEUED_JOB,
  jobId: 'job-003',
  status: 'complete',
  progressPct: 100,
  outputUri: 's3://bucket/renders/job-003.mp4',
  downloadUrl: 'https://example.com/download/job-003.mp4',
};

const FAILED_JOB: RenderJob = {
  ...QUEUED_JOB,
  jobId: 'job-004',
  status: 'failed',
  errorMessage: 'FFmpeg crashed',
};

function makeHookReturn(overrides: Partial<ReturnType<typeof mockUseListRenders>> = {}) {
  return {
    renders: [],
    isLoading: false,
    error: null,
    activeCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RendersQueueModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListRenders.mockReturnValue(makeHookReturn());
  });

  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders a dialog with aria-label "Renders in progress"', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Renders in progress' })).toBeTruthy();
  });

  it('renders the heading "Renders in Progress"', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByRole('heading', { name: 'Renders in Progress' })).toBeTruthy();
  });

  it('renders a close button with aria-label "Close renders queue"', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Close renders queue' })).toBeTruthy();
  });

  it('renders a backdrop element with aria-hidden', () => {
    const { container } = render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
  });

  it('passes projectId to useListRenders', () => {
    render(<RendersQueueModal projectId="my-project" onClose={onClose} />);
    expect(mockUseListRenders).toHaveBeenCalledWith('my-project');
  });

  // ── Close behavior ─────────────────────────────────────────────────────────

  it('calls onClose when the × close button is clicked', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close renders queue' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the footer Close button is clicked', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const { container } = render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows loading text while isLoading is true', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ isLoading: true }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('Loading renders…')).toBeTruthy();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error alert when error is present', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ error: new Error('Network failure') }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Network failure');
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state text when there are no renders', () => {
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('No render jobs found for this project.')).toBeTruthy();
  });

  // ── Job list ───────────────────────────────────────────────────────────────

  it('renders a job card for each render job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [QUEUED_JOB, PROCESSING_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
  });

  it('shows the "Queued" status badge for a queued job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [QUEUED_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('Queued')).toBeTruthy();
  });

  it('shows the "Processing" status badge for a processing job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [PROCESSING_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('shows the "Complete" status badge for a completed job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [COMPLETE_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('shows the "Failed" status badge for a failed job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [FAILED_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows progress percentage for a processing job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [PROCESSING_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('55%')).toBeTruthy();
  });

  it('renders a progressbar with aria-valuenow for each job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [PROCESSING_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('55');
  });

  it('shows a Download link for a completed job with a downloadUrl', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [COMPLETE_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    const link = screen.getByRole('link', { name: /Download render job-003/i });
    expect(link.getAttribute('href')).toBe('https://example.com/download/job-003.mp4');
  });

  it('shows the error message for a failed job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [FAILED_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('FFmpeg crashed')).toBeTruthy();
  });

  it('does not show empty state when there are renders', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [QUEUED_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.queryByText('No render jobs found for this project.')).toBeNull();
  });

  it('does not show a Download link for a completed job without a downloadUrl', () => {
    const completeNoUrl: RenderJob = { ...COMPLETE_JOB, downloadUrl: undefined };
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [completeNoUrl] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.queryByRole('link', { name: /Download render/i })).toBeNull();
  });

  it('does not show error message for a failed job without an errorMessage', () => {
    const failedNoMsg: RenderJob = { ...FAILED_JOB, errorMessage: null };
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [failedNoMsg] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.queryByText('FFmpeg crashed')).toBeNull();
  });

  // ── Preset label ───────────────────────────────────────────────────────────

  it('shows a human-readable preset label for a job', () => {
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [QUEUED_JOB] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    // QUEUED_JOB uses preset key '1080p' → label '1080p Full HD'
    expect(screen.getByText(/1080p Full HD/)).toBeTruthy();
  });

  it('falls back to the raw preset key when the key is not in RENDER_PRESET_OPTIONS', () => {
    const unknownPresetJob: RenderJob = {
      ...QUEUED_JOB,
      preset: { key: 'unknown-preset' as RenderJob['preset']['key'], width: 0, height: 0, fps: 0, format: 'mp4', codec: 'h264' },
    };
    mockUseListRenders.mockReturnValue(makeHookReturn({ renders: [unknownPresetJob] }));
    render(<RendersQueueModal projectId="proj-001" onClose={onClose} />);
    expect(screen.getByText('unknown-preset')).toBeTruthy();
  });
});
