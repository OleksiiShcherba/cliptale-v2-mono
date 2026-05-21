import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/lib/db.js';
import type {
  AiGenerationJobRepo,
  CreateFileParams,
  FilesRepo,
  StoryboardIllustrationRepo,
} from '@/jobs/ai-generate.job.js';
import type {
  StoryboardImageFileReadRepo,
  StoryboardReferenceRepo,
} from '@/jobs/storyboardOpenAIImage.job.js';

export const filesRepo: FilesRepo = {
  async createFile(params: CreateFileParams): Promise<string> {
    await pool.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, width, height, display_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
      [
        params.fileId,
        params.userId,
        params.kind,
        params.storageUri,
        params.mimeType,
        params.bytes,
        params.width,
        params.height,
        params.displayName,
      ],
    );
    return params.fileId;
  },

  async markReady(fileId: string): Promise<void> {
    await pool.execute(
      `UPDATE files
          SET status = 'ready',
              error_message = NULL
        WHERE file_id = ?`,
      [fileId],
    );
  },
};

export const aiGenerationJobRepo: AiGenerationJobRepo = {
  async setOutputFile(jobId: string, fileId: string): Promise<void> {
    const [rows] = await pool.execute<Array<{ draft_id: string | null } & RowDataPacket>>(
      'SELECT draft_id FROM ai_generation_jobs WHERE job_id = ?',
      [jobId],
    );
    const draftId = rows.length ? rows[0]!.draft_id : null;

    await pool.execute(
      `UPDATE ai_generation_jobs
       SET status = 'completed', progress = 100, output_file_id = ?
       WHERE job_id = ?`,
      [fileId, jobId],
    );

    if (draftId) {
      await pool.execute(
        'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
        [draftId, fileId],
      );
    }
  },
};

export const storyboardAiGenerationJobRepo: AiGenerationJobRepo & {
  markFailed: (jobId: string, errorMessage: string) => Promise<void>;
} = {
  ...aiGenerationJobRepo,
  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await pool.execute(
      `UPDATE ai_generation_jobs
          SET status = 'failed',
              error_message = ?
        WHERE job_id = ?`,
      [errorMessage, jobId],
    );
  },
};

export const storyboardImageFileReadRepo: StoryboardImageFileReadRepo = {
  async findFilesByIds(params) {
    if (!params.fileIds.length) return [];
    const placeholders = params.fileIds.map(() => '?').join(',');
    const [rows] = await pool.query<Array<{
      file_id: string;
      storage_uri: string;
      mime_type: string | null;
      display_name: string | null;
    } & RowDataPacket>>(
      `SELECT file_id, storage_uri, mime_type, display_name
         FROM files
        WHERE user_id = ?
          AND kind = 'image'
          AND deleted_at IS NULL
          AND file_id IN (${placeholders})`,
      [params.userId, ...params.fileIds],
    );
    return rows
      .filter((row) => row.mime_type)
      .map((row) => ({
        fileId: row.file_id,
        storageUri: row.storage_uri,
        mimeType: row.mime_type!,
        displayName: row.display_name,
      }));
  },
};

export const storyboardReferenceRepo: StoryboardReferenceRepo = {
  async setOutput(params): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_illustration_references
          SET status = 'ready',
              output_file_id = ?,
              error_message = NULL,
              active_lock = 1
        WHERE ai_job_id = ?`,
      [params.outputFileId, params.aiJobId],
    );
  },

  async markFailed(aiJobId: string, errorMessage: string): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_illustration_references
          SET status = 'failed',
              error_message = ?,
              active_lock = NULL
        WHERE ai_job_id = ?`,
      [errorMessage, aiJobId],
    );
  },
};

export const storyboardIllustrationRepo: StoryboardIllustrationRepo = {
  async attachOutputToBlock(params): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_scene_illustration_jobs
          SET status = 'ready',
              output_file_id = ?,
              error_message = NULL
        WHERE ai_job_id = ?`,
      [params.outputFileId, params.aiJobId],
    );

    await pool.execute(
      `INSERT INTO storyboard_block_media (id, block_id, file_id, media_type, sort_order)
       SELECT ?, sj.block_id, ?, 'image', COALESCE(MAX(existing.sort_order) + 1, 0)
         FROM storyboard_scene_illustration_jobs sj
         LEFT JOIN storyboard_block_media existing
           ON existing.block_id = sj.block_id
        WHERE sj.ai_job_id = ?
          AND sj.output_file_id = ?
          AND NOT EXISTS (
            SELECT 1
              FROM storyboard_block_media duplicate
             WHERE duplicate.block_id = sj.block_id
               AND duplicate.file_id = ?
               AND duplicate.media_type = 'image'
          )
        GROUP BY sj.block_id`,
      [
        params.id,
        params.outputFileId,
        params.aiJobId,
        params.outputFileId,
        params.outputFileId,
      ],
    );
  },

  async markFailed(aiJobId: string, errorMessage: string): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_scene_illustration_jobs
          SET status = 'failed',
              error_message = ?
        WHERE ai_job_id = ?`,
      [errorMessage, aiJobId],
    );
  },
};
