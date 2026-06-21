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
  SceneReferenceSelectionRepo,
  StoryboardOpenAIImageJobDeps,
} from '@/jobs/storyboardOpenAIImage.job.js';
import type { ReferenceBlock, ReferenceOutput } from '@/jobs/referenceSelection.js';
import type { CastExtractJobRepository } from '@/jobs/cast-extract.job.js';
import { onSceneImagesAllTerminal } from '@/jobs/storyboardPipelineHooks.js';

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
    const [rows] = await pool.execute<
      Array<{ draft_id: string | null; flow_id: string | null } & RowDataPacket>
    >(
      'SELECT draft_id, flow_id FROM ai_generation_jobs WHERE job_id = ?',
      [jobId],
    );
    const draftId = rows.length ? rows[0]!.draft_id : null;
    const flowId = rows.length ? rows[0]!.flow_id : null;

    await pool.execute(
      `UPDATE ai_generation_jobs
       SET status = 'completed', progress = 100, output_file_id = ?
       WHERE job_id = ?`,
      [fileId, jobId],
    );

    await pool.execute(
      `UPDATE storyboard_scene_video_jobs
          SET status = 'ready',
              output_file_id = ?,
              error_message = NULL,
              active_lock = 1
        WHERE ai_job_id = ?`,
      [fileId, jobId],
    );
    await pool.execute(
      `UPDATE storyboard_music_generation_jobs
          SET status = 'ready',
              output_file_id = ?,
              error_message = NULL,
              active_lock = NULL
        WHERE ai_job_id = ?`,
      [fileId, jobId],
    );

    if (draftId) {
      await pool.execute(
        'INSERT IGNORE INTO draft_files (draft_id, file_id) VALUES (?, ?)',
        [draftId, fileId],
      );
    }

    // Flow result integrity (T13, ADR-0007): when the job was triggered by a
    // canvas Generate (flow_id set), link the produced asset into flow_files.
    // This is the ONLY place a flow_files link is written for a generation, and
    // it runs ONLY on success (setOutputFile is called only on a completed run),
    // so "an asset is linked to a flow iff its generation succeeded" holds. The
    // handler creates exactly one `files` row per job (the first provider output,
    // extras discarded by parseFalOutput), so exactly one link is written.
    // INSERT IGNORE keeps the (flow_id, file_id) link idempotent on replay.
    if (flowId) {
      await pool.execute(
        'INSERT IGNORE INTO flow_files (flow_id, file_id) VALUES (?, ?)',
        [flowId, fileId],
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
    await pool.execute(
      `UPDATE storyboard_scene_video_jobs
          SET status = 'failed',
              error_message = ?,
              active_lock = NULL
        WHERE ai_job_id = ?`,
      [errorMessage, jobId],
    );
    await pool.execute(
      `UPDATE storyboard_music_generation_jobs
          SET status = 'failed',
              error_message = ?,
              active_lock = NULL
        WHERE ai_job_id = ?`,
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

/**
 * Loads all reference blocks for a draft, including their stars and scene links,
 * in cast order (sort_order ASC). Used by the scene generation master to enforce
 * the reference boundary (AC-09, ADR-0008).
 */
export const sceneReferenceSelectionRepo: SceneReferenceSelectionRepo = {
  async loadBlocksForDraft(draftId: string): Promise<ReferenceBlock[]> {
    // Fetch all reference blocks for the draft in cast order
    const [blockRows] = await pool.query<Array<{
      id: string;
      flow_id: string | null;
      window_status: 'pending' | 'running' | 'done' | 'failed' | null;
    } & RowDataPacket>>(
      `SELECT id, flow_id, window_status
         FROM storyboard_reference_blocks
        WHERE draft_id = ?
        ORDER BY sort_order ASC`,
      [draftId],
    );

    if (!blockRows.length) {
      return [];
    }

    const blockIds = blockRows.map((r) => r.id);
    const placeholders = blockIds.map(() => '?').join(',');

    // Fetch all scene links for these blocks in one query
    const [linkRows] = await pool.query<Array<{
      reference_block_id: string;
      scene_block_id: string;
    } & RowDataPacket>>(
      `SELECT reference_block_id, scene_block_id
         FROM storyboard_reference_scene_links
        WHERE reference_block_id IN (${placeholders})`,
      blockIds,
    );

    // Fetch all stars for these blocks in one query (primaryStarFileId only)
    const [starRows] = await pool.query<Array<{
      reference_block_id: string;
      file_id: string;
      is_primary: number | null;
    } & RowDataPacket>>(
      `SELECT reference_block_id, file_id, is_primary
         FROM storyboard_reference_stars
        WHERE reference_block_id IN (${placeholders})
        ORDER BY is_primary DESC, created_at ASC`,
      blockIds,
    );

    // Fetch completed outputs from flow_files for blocks that have a flow_id
    const flowIds = [...new Set(blockRows.map((r) => r.flow_id).filter((id): id is string => id !== null))];
    let flowFileRows: Array<{ flow_id: string; file_id: string; created_at: Date }> = [];
    if (flowIds.length) {
      const flowPlaceholders = flowIds.map(() => '?').join(',');
      const [rows] = await pool.query<Array<{
        flow_id: string;
        file_id: string;
        created_at: Date;
      } & RowDataPacket>>(
        `SELECT flow_id, file_id, created_at
           FROM flow_files
          WHERE flow_id IN (${flowPlaceholders})
            AND deleted_at IS NULL`,
        flowIds,
      );
      flowFileRows = rows;
    }

    // Build maps for efficient lookup
    const linksByBlock = new Map<string, string[]>();
    for (const link of linkRows) {
      const existing = linksByBlock.get(link.reference_block_id) ?? [];
      existing.push(link.scene_block_id);
      linksByBlock.set(link.reference_block_id, existing);
    }

    // Build primaryStarFileId from star rows
    const primaryStarByBlock = new Map<string, string>();
    for (const star of starRows) {
      if (star.is_primary === 1) {
        primaryStarByBlock.set(star.reference_block_id, star.file_id);
      }
    }

    // Build outputs per block from flow_files rows, keyed by flow_id
    const outputsByFlowId = new Map<string, ReferenceOutput[]>();
    for (const row of flowFileRows) {
      const existing = outputsByFlowId.get(row.flow_id) ?? [];
      existing.push({ fileId: row.file_id, createdAt: row.created_at });
      outputsByFlowId.set(row.flow_id, existing);
    }

    return blockRows.map((block): ReferenceBlock => ({
      id: block.id,
      linkedSceneIds: linksByBlock.get(block.id) ?? [],
      outputs: block.flow_id !== null ? (outputsByFlowId.get(block.flow_id) ?? []) : [],
      primaryStarFileId: primaryStarByBlock.get(block.id),
      // AC-10/AC-11 readiness gate: only window_status='done' blocks feed scenes.
      windowStatus: block.window_status,
    }));
  },

  async loadAttachedSceneMediaFileIds(blockId: string): Promise<string[]> {
    // NULL file_id rows are excluded: migration 061 made file_id nullable for
    // motion_graphic placeholder rows; an image row with NULL file_id is not usable.
    // Scene-illustration outputs are also excluded: the worker writes its own
    // generated renders into storyboard_block_media (via attachOutputToBlock).
    // Feeding those back into images.edit() would reproduce the prior render
    // instead of applying the scene prompt + genuine user attachments + references.
    // The subquery matches output_file_id IS NOT NULL to avoid the nullable
    // column matching NULL file_id rows.
    const [rows] = await pool.query<Array<{ file_id: string } & RowDataPacket>>(
      `SELECT m.file_id
         FROM storyboard_block_media m
        WHERE m.block_id = ?
          AND m.media_type = 'image'
          AND m.file_id IS NOT NULL
          AND m.file_id NOT IN (
            SELECT j.output_file_id
              FROM storyboard_scene_illustration_jobs j
             WHERE j.block_id = m.block_id
               AND j.output_file_id IS NOT NULL
          )
        ORDER BY m.sort_order ASC`,
      [blockId],
    );
    return rows.map((r) => r.file_id);
  },
};

/**
 * Persistence for the cast-extract job (R1, AC-01/AC-02). The cast-extract job
 * runs on the storyboard-plan queue (ADR-0002); this repo carries its lifecycle
 * writes to storyboard_cast_extraction_jobs. markCompleted persists the F4
 * `truncated` flag (overflow → truncated) so the API/UI overflow notice has a
 * real value to read. SQL mirrors apps/api updateCastExtractionJobStatus.
 */
const CAST_EXTRACT_ERROR_MESSAGE_MAX = 512; // VARCHAR(512) — migration 052

export const castExtractJobRepo: CastExtractJobRepository = {
  async markRunning(jobId: string): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET status = 'running'
        WHERE id = ?`,
      [jobId],
    );
  },

  async markCompleted(params): Promise<void> {
    await pool.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET status = 'completed',
              proposal_json = ?,
              truncated = ?,
              aggregate_estimate_credits = ?,
              error_message = NULL,
              completed_at = NOW(3),
              failed_at = NULL
        WHERE id = ?`,
      [
        JSON.stringify(params.proposal),
        params.overflow ? 1 : 0,
        params.aggregateEstimateCredits,
        params.jobId,
      ],
    );
  },

  async markFailed(jobId: string, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(
      0,
      CAST_EXTRACT_ERROR_MESSAGE_MAX,
    );
    await pool.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET status = 'failed',
              error_message = ?,
              failed_at = NOW(3)
        WHERE id = ?`,
      [message, jobId],
    );
  },

  async getScriptText(draftId: string, userId: string): Promise<string> {
    const [rows] = await pool.query<Array<{ prompt_doc: unknown } & RowDataPacket>>(
      `SELECT prompt_doc
         FROM generation_drafts
        WHERE id = ?
          AND user_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
      [draftId, userId],
    );
    if (!rows.length) {
      throw new Error(`Generation draft ${draftId} not found`);
    }
    const raw = rows[0]!.prompt_doc;
    const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const blocks: unknown[] = Array.isArray((doc as { blocks?: unknown })?.blocks)
      ? (doc as { blocks: unknown[] }).blocks
      : [];
    // Script = data, never instructions (spec §6.1). Mirrors storyboardPlan.context
    // promptText: join only text blocks, trimmed, blanks dropped.
    return blocks
      .filter(
        (b): b is { type: 'text'; value: string } =>
          !!b &&
          typeof b === 'object' &&
          (b as { type?: unknown }).type === 'text' &&
          typeof (b as { value?: unknown }).value === 'string',
      )
      .map((b) => b.value.trim())
      .filter(Boolean)
      .join('\n\n');
  },

  async getScenes(draftId: string, userId: string) {
    // Real Step-2 scene blocks in story order — id is the same UUID the canvas /
    // SceneLinkSelector use, so the LLM's scene_block_ids preselect directly.
    // user_id scoping guards a non-owner from reading another draft's scenes.
    const [rows] = await pool.query<
      Array<{ id: string; name: string | null; prompt: string | null } & RowDataPacket>
    >(
      `SELECT b.id, b.name, b.prompt
         FROM storyboard_blocks b
         JOIN generation_drafts d ON d.id = b.draft_id
        WHERE b.draft_id = ?
          AND d.user_id = ?
          AND d.deleted_at IS NULL
          AND b.block_type = 'scene'
        ORDER BY b.sort_order ASC`,
      [draftId, userId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.prompt }));
  },
};

/**
 * Assemble the full dependency set for processStoryboardOpenAIImageJob from the
 * runtime clients (F3). Centralised + exported so the wiring — in particular the
 * sceneReferenceSelectionRepo that powers the reference boundary, scoped star
 * gate and derived style description (AC-09) — is testable instead of buried in
 * the side-effecting worker entrypoint.
 */
export function buildStoryboardOpenAIImageJobDeps(
  clients: Pick<StoryboardOpenAIImageJobDeps, 'openai' | 's3' | 'bucket'>,
): StoryboardOpenAIImageJobDeps {
  return {
    ...clients,
    pool,
    filesRepo,
    fileReadRepo: storyboardImageFileReadRepo,
    aiGenerationJobRepo: storyboardAiGenerationJobRepo,
    storyboardSceneRepo: storyboardIllustrationRepo,
    sceneReferenceSelectionRepo,
    // AC-04 (T12): best-effort scene-image phase-completion advance after each scene job.
    onSceneImagesAllTerminal,
  };
}
