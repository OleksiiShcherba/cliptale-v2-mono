/**
 * Shared fixtures and helpers for render.job tests.
 *
 * Both `render.job.test.ts` and `render.job.assets.test.ts` import from here.
 * `vi.hoisted()` and `vi.mock()` calls remain in each test file (Vitest
 * hoisting requirement); this file provides data fixtures and setup helpers.
 */
import { vi } from 'vitest';
import type { Job } from 'bullmq';

import type { RenderVideoJobPayload } from '@ai-video-editor/project-schema';

// ── Fixture data ─────────────────────────────────────────────────────────────

/** Default doc fixture with one video clip referencing asset-aaa. */
export const docJson = {
  title: 'Test Project',
  tracks: [],
  clips: [
    { id: 'clip-1', type: 'video', assetId: 'asset-aaa', trackId: 't1', startFrame: 0, durationFrames: 90 },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a fake BullMQ Job with optional preset overrides. */
export function makeJob(presetOverride?: Partial<RenderVideoJobPayload['preset']>): Job<RenderVideoJobPayload> {
  return {
    data: {
      jobId: 'job-test-001',
      projectId: 'proj-test',
      versionId: 42,
      requestedBy: 'user-001',
      preset: {
        key: '1080p',
        width: 1920,
        height: 1080,
        fps: 30,
        format: 'mp4',
        codec: 'h264',
        ...presetOverride,
      },
    },
  } as unknown as Job<RenderVideoJobPayload>;
}

/** Creates mock S3 client and DB pool with spied methods. */
export function makeDeps() {
  const mockExecute = vi.fn();
  const mockSend = vi.fn().mockResolvedValue({});

  return {
    s3: { send: mockSend } as unknown as import('@aws-sdk/client-s3').S3Client,
    pool: { execute: mockExecute } as unknown as import('mysql2/promise').Pool,
    mockExecute,
    mockSend,
  };
}

/**
 * Sets up the mock pool.execute to return appropriate responses for the
 * success path: updateJobStatus → fetchDocJson → resolveAssetUrls → completeJob.
 */
export function setupSuccessMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])                        // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
    .mockResolvedValueOnce([[{ asset_id: 'asset-aaa', storage_uri: 's3://test-bucket/assets/asset-aaa.mp4' }], []])  // resolveAssetUrls
    .mockResolvedValue([[], []]);                           // completeJob + any further calls
}

/** Sets up mocks for the version-not-found failure path. */
export function setupVersionNotFoundMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])   // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[], []])   // fetchDocJson — empty rows
    .mockResolvedValue([[], []]);      // failJob
}

/** Sets up mocks for the render failure path. */
export function setupRenderFailureMocks(mockExecute: ReturnType<typeof vi.fn>) {
  mockExecute
    .mockResolvedValueOnce([[], []])                        // updateJobStatus('processing', 0)
    .mockResolvedValueOnce([[{ doc_json: docJson }], []])   // fetchDocJson
    .mockResolvedValueOnce([[{ asset_id: 'asset-aaa', storage_uri: 's3://test-bucket/assets/asset-aaa.mp4' }], []])  // resolveAssetUrls
    .mockResolvedValue([[], []]);                           // failJob
}
