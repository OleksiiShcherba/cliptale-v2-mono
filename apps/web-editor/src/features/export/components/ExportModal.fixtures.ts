import type { RenderJob } from '@/features/export/types';
import { vi } from 'vitest';

export const QUEUED_JOB: RenderJob = {
  jobId: 'job-001',
  projectId: 'proj-001',
  versionId: 10,
  status: 'queued',
  progressPct: 0,
  preset: { key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  outputUri: null,
  errorMessage: null,
  createdAt: '2026-04-04T10:00:00.000Z',
  updatedAt: '2026-04-04T10:00:00.000Z',
};

export const PROCESSING_JOB: RenderJob = { ...QUEUED_JOB, status: 'processing', progressPct: 55 };

export const COMPLETE_JOB: RenderJob = {
  ...QUEUED_JOB,
  status: 'complete',
  progressPct: 100,
  outputUri: 's3://bucket/renders/job-001.mp4',
  downloadUrl: 'https://example.com/download/job-001.mp4',
};

export const FAILED_JOB: RenderJob = {
  ...QUEUED_JOB,
  status: 'failed',
  errorMessage: 'FFmpeg crash',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeHookReturn(overrides: Record<string, any> = {}) {
  return {
    startRender: vi.fn().mockResolvedValue(undefined),
    isSubmitting: false,
    activeJobId: null,
    activeJob: undefined,
    isPolling: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  };
}
