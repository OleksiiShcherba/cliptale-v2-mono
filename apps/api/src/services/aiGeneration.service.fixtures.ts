/**
 * Shared fixtures for aiGeneration.service unit tests.
 *
 * Registers module-level mocks for the repository + queue + file-resolver
 * dependencies the service chain touches. Every split test file imports this
 * module at the top so the `vi.mock` calls are applied once, before the
 * service (or resolver) binds its imports. The mocked functions are
 * re-exported as typed `Mock` handles so each test can reset and inspect them.
 *
 * After Batch 1 Subtask 8 the resolver uses `file.repository.findByIdForUser`
 * instead of `asset.repository.getAssetById`. The fixtures here mirror that.
 */
import { vi, type Mock } from 'vitest';

import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as fileRepository from '@/repositories/file.repository.js';
import * as voiceRepository from '@/repositories/voice.repository.js';
import * as enqueueAiGenerateModule from '@/queues/jobs/enqueue-ai-generate.js';
import * as s3Presigner from '@aws-sdk/s3-request-presigner';
import type { FileRow } from '@/repositories/file.repository.js';

vi.mock('@/repositories/aiGenerationJob.repository.js', () => ({
  createJob: vi.fn(),
  getJobById: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-ai-generate.js', () => ({
  enqueueAiGenerateJob: vi.fn(),
}));

vi.mock('@/repositories/file.repository.js', () => ({
  findByIdForUser: vi.fn(),
  createPending: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/repositories/voice.repository.js', () => ({
  getVoicesByUserId: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// The resolver imports the singleton s3Client from @/lib/s3.js. Stub it to
// a trivial object so that importing the module never touches real AWS SDK
// configuration or env vars in a unit-test context.
vi.mock('@/lib/s3.js', () => ({
  s3Client: {},
}));

export const createJobMock = aiGenerationJobRepository.createJob as unknown as Mock;
export const getJobByIdMock = aiGenerationJobRepository.getJobById as unknown as Mock;
export const enqueueMock =
  enqueueAiGenerateModule.enqueueAiGenerateJob as unknown as Mock;
export const findByIdForUserMock =
  fileRepository.findByIdForUser as unknown as Mock;
export const getVoicesByUserIdMock =
  voiceRepository.getVoicesByUserId as unknown as Mock;
export const getSignedUrlMock = s3Presigner.getSignedUrl as unknown as Mock;

export const TEST_USER = 'user-abc';
export const TEST_FILE_ID = 'file-fixture-001';
export const FIXED_JOB_ID = 'job-fixed-000';
export const FIXED_PRESIGNED_URL = 'https://s3.example.com/presigned-foo';

/** Builds a minimal `FileRow` for resolver tests. Override any fields per-test. */
export function makeFileRow(overrides: Partial<FileRow> = {}): FileRow {
  return {
    fileId: TEST_FILE_ID,
    userId: TEST_USER,
    kind: 'image',
    storageUri: 's3://test-bucket/users/user-abc/files/file-fixture-001/fixture.png',
    mimeType: 'image/png',
    bytes: 1024,
    width: 512,
    height: 512,
    durationMs: null,
    displayName: 'fixture.png',
    status: 'ready',
    errorMessage: null,
    createdAt: new Date('2026-04-18T00:00:00Z'),
    updatedAt: new Date('2026-04-18T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

/** Resets every mock to a clean, default-resolved state. */
export function resetMocks(): void {
  createJobMock.mockReset();
  getJobByIdMock.mockReset();
  enqueueMock.mockReset();
  findByIdForUserMock.mockReset();
  getVoicesByUserIdMock.mockReset();
  getSignedUrlMock.mockReset();
  createJobMock.mockResolvedValue(undefined);
  enqueueMock.mockResolvedValue(FIXED_JOB_ID);
  // Default: no file row; tests that exercise the resolver must arrange a
  // row via `findByIdForUserMock.mockResolvedValue(makeFileRow({ ... }))`.
  findByIdForUserMock.mockResolvedValue(null);
  getVoicesByUserIdMock.mockResolvedValue([]);
  getSignedUrlMock.mockResolvedValue(FIXED_PRESIGNED_URL);
}
