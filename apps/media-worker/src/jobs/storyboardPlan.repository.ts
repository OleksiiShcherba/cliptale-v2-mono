import type { Pool } from 'mysql2/promise';

import {
  storyboardPlanSchema,
  type StoryboardPlan,
} from '@ai-video-editor/project-schema';

export type StoryboardPlanJobRepository = {
  markRunning(jobId: string): Promise<void>;
  markCompleted(params: {
    jobId: string;
    model: string;
    plan: StoryboardPlan;
    mediaContext: unknown;
  }): Promise<void>;
  markFailed(jobId: string, error: unknown): Promise<void>;
};

export function sanitizeStoryboardPlanJobError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutUrls = raw.replace(/\b(?:https?|s3|r2):\/\/\S+/gi, '[redacted-url]');
  const withoutTokenValues = withoutUrls.replace(
    /\b[A-Z0-9_-]*(?:api[_-]?key|secret|token|authorization)\s*[:=]\s*\S+/gi,
    '[redacted]',
  );
  const withoutKeys = withoutTokenValues.replace(/\b(?:sk|pk|rk|sess|secret|token|key)_[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  const singleLine = withoutKeys
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (singleLine ?? 'Storyboard plan job failed').slice(0, 512);
}

export function createStoryboardPlanJobRepository(pool: Pool): StoryboardPlanJobRepository {
  return {
    async markRunning(jobId: string): Promise<void> {
      await pool.query(
        `UPDATE storyboard_plan_jobs
            SET status = 'running',
                error_message = NULL,
                failed_at = NULL
          WHERE job_id = ?`,
        [jobId],
      );
    },

    async markCompleted(params): Promise<void> {
      const plan = storyboardPlanSchema.parse(params.plan);
      await pool.query(
        `UPDATE storyboard_plan_jobs
            SET status = 'completed',
                model = ?,
                plan_json = ?,
                media_context_json = ?,
                error_message = NULL,
                completed_at = NOW(3),
                failed_at = NULL
          WHERE job_id = ?`,
        [
          params.model,
          JSON.stringify(plan),
          JSON.stringify(params.mediaContext),
          params.jobId,
        ],
      );
    },

    async markFailed(jobId: string, error: unknown): Promise<void> {
      await pool.query(
        `UPDATE storyboard_plan_jobs
            SET status = 'failed',
                error_message = ?,
                failed_at = NOW(3)
          WHERE job_id = ?`,
        [sanitizeStoryboardPlanJobError(error), jobId],
      );
    },
  };
}
