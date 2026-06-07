import { randomUUID } from 'node:crypto';

import {
  REALTIME_REDIS_CHANNEL,
  type RealtimeAiJobEvent,
  type RealtimeStoryboardEvent,
} from '@ai-video-editor/project-schema';
import Redis from 'ioredis';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import { config } from '@/config.js';

/** Local event type for cast extraction updates (events.md §87-104). */
type RealtimeCastExtractionEvent = {
  type: 'storyboard.cast_extraction.updated';
  eventId?: string;
  userId: string;
  occurredAt?: string;
  jobId: string;
  draftId: string;
  status: string;
  aggregateEstimateCredits: number | null;
  errorMessage: string | null;
};

type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type AiJobRealtimeRow = RowDataPacket & {
  job_id: string;
  user_id: string;
  model_id: string;
  capability: string;
  status: AiJobStatus;
  progress: number;
  output_file_id: string | null;
  draft_id: string | null;
  result_url: string | null;
  error_message: string | null;
};

type StoryboardPlanRow = RowDataPacket & {
  job_id: string;
  draft_id: string;
  user_id: string;
  status: string;
  plan_json: unknown | null;
  error_message: string | null;
};

type StoryboardBindingRow = RowDataPacket & {
  resource: 'storyboardIllustrations' | 'storyboardVideos' | 'storyboardMusic';
  block_id: string | null;
  music_block_id: string | null;
  status: string | null;
  output_file_id: string | null;
  error_message: string | null;
};

type PublishableRealtimeEvent = RealtimeAiJobEvent | RealtimeStoryboardEvent | RealtimeCastExtractionEvent;

let redis: Redis | null = null;

function getRedisPublisher(): Redis | null {
  if (redis) return redis;
  const redisUrl = config.redis.url;
  if (!redisUrl) return null;

  redis = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  redis.on('error', (err: Error) => {
    console.error('[realtime] Redis publisher error:', err.message);
  });
  return redis;
}

async function publishRealtimeEvent(event: PublishableRealtimeEvent): Promise<void> {
  const publisher = getRedisPublisher();
  if (!publisher) return;

  try {
    await publisher.publish(
      REALTIME_REDIS_CHANNEL,
      JSON.stringify({
        ...event,
        eventId: event.eventId ?? randomUUID(),
        occurredAt: event.occurredAt ?? new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('[realtime] Failed to publish status event:', error);
  }
}

export async function publishStoryboardPlanStatus(params: {
  pool: Pool;
  jobId: string;
}): Promise<void> {
  if (typeof params.pool.query !== 'function') return;

  let row: StoryboardPlanRow | undefined;
  try {
    const [rows] = await params.pool.query<StoryboardPlanRow[]>(
      `SELECT job_id, draft_id, user_id, status, plan_json, error_message
         FROM storyboard_plan_jobs
        WHERE job_id = ?`,
      [params.jobId],
    );
    row = rows[0];
  } catch {
    return;
  }
  if (!row) return;

  await publishRealtimeEvent({
    type: 'storyboard.status.updated',
    userId: row.user_id,
    draftId: row.draft_id,
    payload: {
      resource: 'storyboardPlan',
      jobId: row.job_id,
      status: row.status,
      plan: row.plan_json,
      errorMessage: row.error_message,
    },
  });
}

export async function publishAiGenerationJobStatus(params: {
  pool: Pool;
  jobId: string;
}): Promise<void> {
  if (typeof params.pool.query !== 'function') return;

  let row: AiJobRealtimeRow | undefined;
  try {
    const [rows] = await params.pool.query<AiJobRealtimeRow[]>(
      `SELECT job_id, user_id, model_id, capability, status, progress,
              output_file_id, draft_id, result_url, error_message
         FROM ai_generation_jobs
        WHERE job_id = ?`,
      [params.jobId],
    );
    row = rows[0];
  } catch {
    return;
  }
  if (!row) return;

  const payload = {
    jobId: row.job_id,
    draftId: row.draft_id,
    status: row.status,
    progress: row.progress,
    outputFileId: row.output_file_id,
    resultUrl: row.result_url,
    errorMessage: row.error_message,
    modelId: row.model_id,
    capability: row.capability,
  };

  await publishRealtimeEvent({
    type: 'ai.job.updated',
    userId: row.user_id,
    jobId: row.job_id,
    draftId: row.draft_id,
    payload,
  });

  if (!row.draft_id) return;

  await publishRealtimeEvent({
    type: 'storyboard.status.updated',
    userId: row.user_id,
    draftId: row.draft_id,
    payload: {
      resource: 'aiGenerationJob',
      ...payload,
      storyboardBindings: await findStoryboardBindings(params.pool, row.job_id),
    },
  });
}

type CastExtractionRow = RowDataPacket & {
  job_id: string;
  draft_id: string;
  user_id: string;
  status: string;
  aggregate_estimate_credits: string | null;
  error_message: string | null;
};

export async function publishCastExtractionStatus(params: {
  pool: Pool;
  jobId: string;
}): Promise<void> {
  if (typeof params.pool.query !== 'function') return;

  let row: CastExtractionRow | undefined;
  try {
    const [rows] = await params.pool.query<CastExtractionRow[]>(
      `SELECT id AS job_id, draft_id, user_id, status, aggregate_estimate_credits, error_message
         FROM storyboard_cast_extraction_jobs
        WHERE id = ?`,
      [params.jobId],
    );
    row = rows[0];
  } catch {
    return;
  }
  if (!row) return;

  await publishRealtimeEvent({
    type: 'storyboard.cast_extraction.updated',
    userId: row.user_id,
    jobId: row.job_id,
    draftId: row.draft_id,
    status: row.status,
    aggregateEstimateCredits:
      row.aggregate_estimate_credits !== null
        ? Number(row.aggregate_estimate_credits)
        : null,
    errorMessage: row.error_message,
  });
}

type ReferenceBlockRow = RowDataPacket & {
  id: string;
  draft_id: string;
  user_id: string;
  window_status: string;
  error_message: string | null;
};

export async function publishReferenceBlockStatus(params: {
  pool: Pool;
  blockId: string;
}): Promise<void> {
  if (typeof params.pool.query !== 'function') return;

  let row: ReferenceBlockRow | undefined;
  try {
    const [rows] = await params.pool.query<ReferenceBlockRow[]>(
      `SELECT srb.id, srb.draft_id, gd.user_id, srb.window_status, srb.error_message
         FROM storyboard_reference_blocks srb
         JOIN generation_drafts gd ON gd.id = srb.draft_id
        WHERE srb.id = ?`,
      [params.blockId],
    );
    row = rows[0];
  } catch {
    return;
  }
  if (!row) return;

  await publishRealtimeEvent({
    type: 'storyboard.status.updated',
    userId: row.user_id,
    draftId: row.draft_id,
    payload: {
      resource: 'storyboardPlan',
      jobId: row.id,
      status: row.window_status,
      plan: null,
      errorMessage: row.error_message,
    },
  });
}

async function findStoryboardBindings(
  pool: Pool,
  jobId: string,
): Promise<StoryboardBindingRow[]> {
  try {
    const [rows] = await pool.query<StoryboardBindingRow[]>(
      `(SELECT 'storyboardIllustrations' AS resource, block_id, NULL AS music_block_id,
               status, output_file_id, error_message
          FROM storyboard_scene_illustration_jobs
         WHERE ai_job_id = ?)
       UNION ALL
       (SELECT 'storyboardIllustrations' AS resource, NULL AS block_id, NULL AS music_block_id,
               status, output_file_id, error_message
          FROM storyboard_illustration_references
         WHERE ai_job_id = ?)
       UNION ALL
       (SELECT 'storyboardVideos' AS resource, block_id, NULL AS music_block_id,
               status, output_file_id, error_message
          FROM storyboard_scene_video_jobs
         WHERE ai_job_id = ?)
       UNION ALL
       (SELECT 'storyboardMusic' AS resource, NULL AS block_id, music_block_id,
               status, output_file_id, error_message
          FROM storyboard_music_generation_jobs
         WHERE ai_job_id = ?)`,
      [jobId, jobId, jobId, jobId],
    );
    return rows;
  } catch {
    return [];
  }
}
