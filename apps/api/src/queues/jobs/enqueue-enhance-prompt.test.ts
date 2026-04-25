import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { EnhancePromptJobPayload } from '@ai-video-editor/project-schema';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockAiEnhanceQueueAdd } = vi.hoisted(() => ({
  mockAiEnhanceQueueAdd: vi.fn(),
}));

vi.mock('@/queues/bullmq.js', () => ({
  aiEnhanceQueue: { add: mockAiEnhanceQueueAdd },
}));

import { enqueueEnhancePrompt } from './enqueue-enhance-prompt.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PAYLOAD: EnhancePromptJobPayload = {
  draftId: 'draft-abc-123',
  userId: 'user-xyz-456',
  promptDoc: {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'Make an exciting video about cats' }],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enqueueEnhancePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAiEnhanceQueueAdd.mockResolvedValue({ id: 'mock-job-id' });
  });

  it('should call aiEnhanceQueue.add with the correct job name and payload', async () => {
    await enqueueEnhancePrompt(BASE_PAYLOAD);

    expect(mockAiEnhanceQueueAdd).toHaveBeenCalledOnce();
    const [jobName, jobPayload] = mockAiEnhanceQueueAdd.mock.calls[0] as [string, EnhancePromptJobPayload, unknown];
    expect(jobName).toBe('enhance-prompt');
    expect(jobPayload).toMatchObject(BASE_PAYLOAD);
  });

  it('should return the BullMQ jobId as a non-empty string', async () => {
    const result = await enqueueEnhancePrompt(BASE_PAYLOAD);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should pass a jobId option to aiEnhanceQueue.add that matches the returned string', async () => {
    const returnedJobId = await enqueueEnhancePrompt(BASE_PAYLOAD);

    const callOptions = mockAiEnhanceQueueAdd.mock.calls[0][2] as { jobId?: string };
    expect(callOptions.jobId).toBe(returnedJobId);
  });

  it('should configure attempts: 3 with exponential backoff', async () => {
    await enqueueEnhancePrompt(BASE_PAYLOAD);

    const callOptions = mockAiEnhanceQueueAdd.mock.calls[0][2] as {
      attempts?: number;
      backoff?: { type: string; delay: number };
    };
    expect(callOptions.attempts).toBe(3);
    expect(callOptions.backoff?.type).toBe('exponential');
    expect(callOptions.backoff?.delay).toBeGreaterThan(0);
  });

  it('should configure removeOnComplete (1 h) and removeOnFail (24 h) TTLs', async () => {
    await enqueueEnhancePrompt(BASE_PAYLOAD);

    const callOptions = mockAiEnhanceQueueAdd.mock.calls[0][2] as {
      removeOnComplete?: { age: number };
      removeOnFail?: { age: number };
    };
    // 1 hour so GET /enhance/:jobId works for up to an hour after completion
    expect(callOptions.removeOnComplete?.age).toBe(3_600);
    // 24 hours for failed jobs to preserve debugging context
    expect(callOptions.removeOnFail?.age).toBe(86_400);
  });

  it('should generate a unique jobId per call (non-idempotent)', async () => {
    const id1 = await enqueueEnhancePrompt(BASE_PAYLOAD);
    const id2 = await enqueueEnhancePrompt(BASE_PAYLOAD);

    expect(id1).not.toBe(id2);
  });

  it('should include media-ref blocks in the payload without modification', async () => {
    const payloadWithMedia: EnhancePromptJobPayload = {
      draftId: 'draft-media-test',
      userId: 'user-media-test',
      promptDoc: {
        schemaVersion: 1,
        blocks: [
          { type: 'text', value: 'Make a video about ' },
          { type: 'media-ref', mediaType: 'video', fileId: '00000000-0000-0000-0000-000000000001', label: 'my cat video' },
          { type: 'text', value: ' with some music' },
          { type: 'media-ref', mediaType: 'audio', fileId: '00000000-0000-0000-0000-000000000002', label: 'background track' },
        ],
      },
    };

    await enqueueEnhancePrompt(payloadWithMedia);

    const jobPayload = mockAiEnhanceQueueAdd.mock.calls[0][1] as EnhancePromptJobPayload;
    expect(jobPayload.promptDoc.blocks).toHaveLength(4);
    expect(jobPayload.promptDoc.blocks[1]).toMatchObject({
      type: 'media-ref',
      fileId: '00000000-0000-0000-0000-000000000001',
    });
  });
});
