/**
 * Shared test fixtures for render.service tests.
 * Imported by render.service.test.ts and render.service.presets.test.ts.
 */
import type { RenderJob } from '@/repositories/render.repository.js';
import { ALLOWED_PRESETS } from './render.service.js';

export const mockVersion = {
  versionId: 42,
  projectId: 'proj-abc',
  docJson: { title: 'Test Project' },
  docSchemaVersion: 1,
  createdByUserId: 'user-001',
  createdAt: new Date('2026-04-04T10:00:00.000Z'),
  parentVersionId: null,
};

export const mockJob: RenderJob = {
  jobId: 'job-uuid-123',
  projectId: 'proj-abc',
  versionId: 42,
  requestedBy: 'user-001',
  status: 'queued',
  progressPct: 0,
  preset: ALLOWED_PRESETS['1080p'],
  outputUri: null,
  errorMessage: null,
  createdAt: new Date('2026-04-04T10:00:00.000Z'),
  updatedAt: new Date('2026-04-04T10:00:00.000Z'),
};
