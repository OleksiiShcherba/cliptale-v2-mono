import { describe, expect, it } from 'vitest';

import {
  realtimeClientMessageSchema,
  realtimeRedisEventSchema,
  realtimeServerMessageSchema,
} from './realtime.schema.js';

describe('realtime schemas', () => {
  it('accepts draft storyboard subscribe and unsubscribe messages', () => {
    expect(
      realtimeClientMessageSchema.parse({
        type: 'subscribe',
        requestId: 'req-1',
        scope: 'draft-storyboard',
        draftId: 'draft-1',
      }),
    ).toMatchObject({ scope: 'draft-storyboard', draftId: 'draft-1' });

    expect(
      realtimeClientMessageSchema.parse({
        type: 'unsubscribe',
        scope: 'draft-storyboard',
        draftId: 'draft-1',
      }),
    ).toMatchObject({ type: 'unsubscribe', scope: 'draft-storyboard' });
  });

  it('accepts AI job subscribe messages', () => {
    expect(
      realtimeClientMessageSchema.parse({
        type: 'subscribe',
        scope: 'ai-job',
        jobId: 'job-1',
      }),
    ).toMatchObject({ scope: 'ai-job', jobId: 'job-1' });
  });

  it('rejects subscribe messages without the required scoped resource id', () => {
    expect(() =>
      realtimeClientMessageSchema.parse({
        type: 'subscribe',
        scope: 'ai-job',
        draftId: 'draft-1',
      }),
    ).toThrow();
  });

  it('documents Redis storyboard and AI job event envelopes', () => {
    expect(
      realtimeRedisEventSchema.parse({
        type: 'storyboard.status.updated',
        userId: 'user-1',
        draftId: 'draft-1',
        payload: { status: 'running' },
      }),
    ).toMatchObject({ type: 'storyboard.status.updated' });

    expect(
      realtimeRedisEventSchema.parse({
        type: 'ai.job.updated',
        userId: 'user-1',
        jobId: 'job-1',
        draftId: null,
        payload: { status: 'completed', outputFileId: 'file-1' },
      }),
    ).toMatchObject({ type: 'ai.job.updated' });
  });

  it('accepts server event messages sent over the socket', () => {
    expect(
      realtimeServerMessageSchema.parse({
        type: 'event',
        event: {
          type: 'ai.job.updated',
          userId: 'user-1',
          jobId: 'job-1',
          payload: { progress: 50 },
        },
      }),
    ).toMatchObject({ type: 'event' });
  });
});
