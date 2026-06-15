/**
 * One-time cut-over backfill: seeds a storyboard_pipeline row for every
 * migratable old-flow draft that does not yet have a pipeline row —
 * a queued/running plan / cast / reference / illustration job, a cast
 * proposal awaiting review, or a Step-2 draft whose scenes are already
 * generated (seeded `scene completed`, see review r3 F1).
 *
 * storyboard-generation-pipeline T21
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';

export type ActivePhase = 'scene' | 'reference_data' | 'reference_image' | 'scene_image';

export interface BackfillEntry {
  draftId: string;
  activePhase: ActivePhase;
  activeRunPhase: ActivePhase | null;
  sceneStatus: string;
  referenceDataStatus: string;
  referenceImageStatus: string;
  sceneImageStatus: string;
}

export interface BackfillReport {
  examined: number;
  seeded: number;
  skipped: number;
  entries: BackfillEntry[];
}

// ── In-flight signal detection query ─────────────────────────────────────────

/**
 * Finds all generation_drafts that:
 *   a) have at least one MIGRATABLE old-flow signal, AND
 *   b) do NOT yet have a storyboard_pipeline row.
 *
 * Migratable signals (OQ-2 = "in-flight old-flow drafts"):
 *   - a queued/running plan, cast-extraction, reference-image or scene-illustration
 *     job (genuinely in-flight work the new pipeline must reflect), OR
 *   - a completed cast extraction with a proposal awaiting review, OR
 *   - a draft parked on Step-2 (status='step2') **that already has generated scene
 *     blocks** — its scene phase is done; we seed it `scene completed` so resume
 *     returns it healthy instead of re-planning it (lazy-create auto-starts scenes
 *     only when no row exists). A step2 draft with NO scenes is NOT migratable here:
 *     it has no in-flight work, and resume lazy-create auto-starts its scene gen.
 *
 * The bare `status='step2'` predicate was REMOVED (review r3, F1): step2 is the
 * normal status for ANY draft parked on Step-2, so it over-seeded every idle/finished
 * draft as scene/running — throwing the owner behind a phantom scene-gen loader that
 * the reaper then failed at the 10-min bound.
 *
 * Also separately counts drafts that DO have a pipeline row (skipped).
 */
const SCAN_SQL = `
  SELECT
    d.id AS draft_id,

    -- scene_illustration signal (highest priority)
    MAX(CASE WHEN si.status IN ('queued','running') THEN 1 ELSE 0 END) AS has_illus_active,

    -- reference_blocks signal
    MAX(CASE WHEN rb.window_status IN ('pending','running') THEN 1 ELSE 0 END) AS has_ref_image_active,

    -- cast_extraction signals
    MAX(CASE WHEN ce.status = 'completed' AND ce.proposal_json IS NOT NULL THEN 1 ELSE 0 END) AS has_cast_awaiting,
    MAX(CASE WHEN ce.status IN ('queued','running') THEN 1 ELSE 0 END) AS has_cast_running,

    -- plan_job signal
    MAX(CASE WHEN pj.status IN ('queued','running') THEN 1 ELSE 0 END) AS has_plan_active,

    -- generated-scene signal (a step2 draft with scenes = scene phase already done)
    MAX(CASE WHEN scn.id IS NOT NULL THEN 1 ELSE 0 END) AS has_scenes

  FROM generation_drafts d

  LEFT JOIN storyboard_pipeline        sp ON sp.draft_id = d.id
  LEFT JOIN storyboard_scene_illustration_jobs si ON si.draft_id = d.id
  LEFT JOIN storyboard_reference_blocks        rb ON rb.draft_id = d.id
  LEFT JOIN storyboard_cast_extraction_jobs    ce ON ce.draft_id = d.id
  LEFT JOIN storyboard_plan_jobs               pj ON pj.draft_id = d.id
  LEFT JOIN storyboard_blocks                  scn ON scn.draft_id = d.id AND scn.block_type = 'scene'

  WHERE sp.draft_id IS NULL
    AND (
      si.status IN ('queued','running')
      OR rb.window_status IN ('pending','running')
      OR ce.status IN ('queued','running')
      OR (ce.status = 'completed' AND ce.proposal_json IS NOT NULL)
      OR pj.status IN ('queued','running')
      OR (d.status = 'step2' AND scn.id IS NOT NULL)
    )

  GROUP BY d.id
`;

const SKIP_COUNT_SQL = `
  SELECT COUNT(DISTINCT d.id) AS n
  FROM generation_drafts d
  INNER JOIN storyboard_pipeline sp ON sp.draft_id = d.id
  WHERE (
    EXISTS (SELECT 1 FROM storyboard_scene_illustration_jobs si WHERE si.draft_id = d.id AND si.status IN ('queued','running'))
    OR EXISTS (SELECT 1 FROM storyboard_reference_blocks rb WHERE rb.draft_id = d.id AND rb.window_status IN ('pending','running'))
    OR EXISTS (SELECT 1 FROM storyboard_cast_extraction_jobs ce WHERE ce.draft_id = d.id AND (ce.status IN ('queued','running') OR (ce.status = 'completed' AND ce.proposal_json IS NOT NULL)))
    OR EXISTS (SELECT 1 FROM storyboard_plan_jobs pj WHERE pj.draft_id = d.id AND pj.status IN ('queued','running'))
    OR (d.status = 'step2' AND EXISTS (SELECT 1 FROM storyboard_blocks b WHERE b.draft_id = d.id AND b.block_type = 'scene'))
  )
`;

// ── Phase mapping ──────────────────────────────────────────────────────────────

type ScanRow = RowDataPacket & {
  draft_id: string;
  has_illus_active: number;
  has_ref_image_active: number;
  has_cast_awaiting: number;
  has_cast_running: number;
  has_plan_active: number;
  has_scenes: number;
};

function mapToEntry(row: ScanRow): BackfillEntry {
  const draftId = row.draft_id;

  // Priority order: most-advanced phase wins.

  // 1. scene_illustration job queued/running → scene_image phase
  if (row.has_illus_active) {
    return {
      draftId,
      activePhase: 'scene_image',
      activeRunPhase: 'scene_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'running',
    };
  }

  // 2. reference_blocks with pending/running window_status → reference_image phase
  if (row.has_ref_image_active) {
    return {
      draftId,
      activePhase: 'reference_image',
      activeRunPhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
    };
  }

  // 3. cast_extraction completed with non-null proposal_json → awaiting_review
  if (row.has_cast_awaiting) {
    return {
      draftId,
      activePhase: 'reference_data',
      activeRunPhase: null,
      sceneStatus: 'completed',
      referenceDataStatus: 'awaiting_review',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
    };
  }

  // 4. cast_extraction queued/running → reference_data running
  if (row.has_cast_running) {
    return {
      draftId,
      activePhase: 'reference_data',
      activeRunPhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
    };
  }

  // 5. plan job queued/running → scene phase still in progress (loader + heartbeat;
  //    a real job is running, so the reaper bound is meaningful).
  if (row.has_plan_active) {
    return {
      draftId,
      activePhase: 'scene',
      activeRunPhase: 'scene',
      sceneStatus: 'running',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
    };
  }

  // 6. step2 draft whose scenes are already generated, no active job (F1) → scene
  //    COMPLETED with no active run, so resume returns it healthy (no phantom loader,
  //    no reaper kill) and the Creator can trigger the next phase from the corners.
  return {
    draftId,
    activePhase: 'scene',
    activeRunPhase: null,
    sceneStatus: 'completed',
    referenceDataStatus: 'idle',
    referenceImageStatus: 'idle',
    sceneImageStatus: 'idle',
  };
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Scans every generation_draft that has in-flight old-flow signals and no
 * storyboard_pipeline row yet, then either inserts a pipeline row (dryRun:
 * false) or reports what would be inserted (dryRun: true).
 */
export async function backfillStoryboardPipeline(
  pool: Pool,
  opts: { dryRun: boolean },
): Promise<BackfillReport> {
  const conn = await pool.getConnection();
  try {
    // 1. Scan for in-flight drafts with no pipeline row.
    const [scanRows] = await conn.query<ScanRow[]>(SCAN_SQL);

    const entries: BackfillEntry[] = scanRows.map(mapToEntry);
    const examined = entries.length;

    // 2. Count already-seeded in-flight drafts (skipped).
    const [skipRows] = await conn.query<RowDataPacket[]>(SKIP_COUNT_SQL);
    const skipped = Number((skipRows[0] as RowDataPacket & { n: number })?.n ?? 0);

    // 3. Insert rows when not a dry-run.
    let seeded = 0;
    if (!opts.dryRun && entries.length > 0) {
      for (const entry of entries) {
        const hasRunPhase = entry.activeRunPhase !== null;
        const [result] = await conn.execute<import('mysql2/promise').ResultSetHeader>(
          `INSERT IGNORE INTO storyboard_pipeline
             (draft_id, active_phase, active_run_phase,
              scene_status, reference_data_status, reference_image_status, scene_image_status,
              version, created_at, updated_at,
              phase_started_at, heartbeat_at)
           VALUES
             (?, ?, ?,
              ?, ?, ?, ?,
              1, NOW(3), NOW(3),
              ${hasRunPhase ? 'NOW(3)' : 'NULL'},
              ${hasRunPhase ? 'NOW(3)' : 'NULL'})`,
          [
            entry.draftId,
            entry.activePhase,
            entry.activeRunPhase,
            entry.sceneStatus,
            entry.referenceDataStatus,
            entry.referenceImageStatus,
            entry.sceneImageStatus,
          ],
        );
        seeded += result.affectedRows;
      }
    }

    return { examined, seeded, skipped, entries };
  } finally {
    conn.release();
  }
}
