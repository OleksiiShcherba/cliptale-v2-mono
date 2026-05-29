import { z } from 'zod';

export const REALTIME_REDIS_CHANNEL = 'cliptale:realtime:v1';

export const realtimeSubscriptionScopeSchema = z.enum(['draft-storyboard', 'ai-job']);

export const realtimeSubscribeMessageSchema = z.discriminatedUnion('scope', [
  z.object({
    type: z.literal('subscribe'),
    requestId: z.string().min(1).max(128).optional(),
    scope: z.literal('draft-storyboard'),
    draftId: z.string().min(1),
  }),
  z.object({
    type: z.literal('subscribe'),
    requestId: z.string().min(1).max(128).optional(),
    scope: z.literal('ai-job'),
    jobId: z.string().min(1),
  }),
]);

export const realtimeUnsubscribeMessageSchema = z.discriminatedUnion('scope', [
  z.object({
    type: z.literal('unsubscribe'),
    requestId: z.string().min(1).max(128).optional(),
    scope: z.literal('draft-storyboard'),
    draftId: z.string().min(1),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    requestId: z.string().min(1).max(128).optional(),
    scope: z.literal('ai-job'),
    jobId: z.string().min(1),
  }),
]);

export const realtimeClientMessageSchema = z.union([
  realtimeSubscribeMessageSchema,
  realtimeUnsubscribeMessageSchema,
]);

const realtimeEventBaseSchema = z.object({
  eventId: z.string().min(1).optional(),
  userId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});

export const realtimeStoryboardEventSchema = realtimeEventBaseSchema.extend({
  type: z.literal('storyboard.status.updated'),
  draftId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export const realtimeAiJobEventSchema = realtimeEventBaseSchema.extend({
  type: z.literal('ai.job.updated'),
  jobId: z.string().min(1),
  draftId: z.string().min(1).nullable().optional(),
  payload: z.record(z.unknown()).default({}),
});

export const realtimeRedisEventSchema = z.discriminatedUnion('type', [
  realtimeStoryboardEventSchema,
  realtimeAiJobEventSchema,
]);

export const realtimeServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('connected'),
    heartbeatMs: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('subscribed'),
    requestId: z.string().min(1).max(128).optional(),
    scope: realtimeSubscriptionScopeSchema,
    resourceId: z.string().min(1),
  }),
  z.object({
    type: z.literal('unsubscribed'),
    requestId: z.string().min(1).max(128).optional(),
    scope: realtimeSubscriptionScopeSchema,
    resourceId: z.string().min(1),
  }),
  z.object({
    type: z.literal('event'),
    event: realtimeRedisEventSchema,
  }),
  z.object({
    type: z.literal('error'),
    requestId: z.string().min(1).max(128).optional(),
    code: z.enum(['bad_message', 'unauthorized', 'forbidden', 'not_found', 'internal_error']),
    message: z.string().min(1),
  }),
]);

export type RealtimeSubscriptionScope = z.infer<typeof realtimeSubscriptionScopeSchema>;
export type RealtimeSubscribeMessage = z.infer<typeof realtimeSubscribeMessageSchema>;
export type RealtimeUnsubscribeMessage = z.infer<typeof realtimeUnsubscribeMessageSchema>;
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;
export type RealtimeStoryboardEvent = z.infer<typeof realtimeStoryboardEventSchema>;
export type RealtimeAiJobEvent = z.infer<typeof realtimeAiJobEventSchema>;
export type RealtimeRedisEvent = z.infer<typeof realtimeRedisEventSchema>;
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;
