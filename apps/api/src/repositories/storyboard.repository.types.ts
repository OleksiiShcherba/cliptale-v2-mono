/**
 * Shared types and internal DB row mappers for storyboard.repository.ts.
 * Extracted to keep the repository file under the 300-line cap.
 */

import type { RowDataPacket } from 'mysql2/promise';

// ── Public domain types ───────────────────────────────────────────────────────

/** Valid block_type values matching the storyboard_blocks ENUM. */
export type BlockType = 'start' | 'end' | 'scene';

/** Frozen motion-graphic snapshot hydrated onto a motion_graphic media item.
 *  On the READ path all geometry fields are populated; on the SAVE path only the
 *  snapshotId is known (the rest are immutable in the DB and need not round-trip). */
export type BlockMediaMotionGraphicSnapshot = {
  snapshotId: string;
  code?: string;
  durationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Optional source-graphic title (LEFT JOIN motion_graphics); null if source gone. */
  title?: string | null;
};

/** A single media attachment on a storyboard block.
 *  motion_graphic rows carry a frozen snapshot and a NULL file_id (ADR-0009). */
export type BlockMediaItem = {
  id: string;
  fileId: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'motion_graphic';
  sortOrder: number;
  /** Present only for media_type='motion_graphic' rows with a live snapshot FK. */
  motionGraphic?: BlockMediaMotionGraphicSnapshot;
};

/** A fully-hydrated storyboard block (includes mediaItems). */
export type StoryboardBlock = {
  id: string;
  draftId: string;
  blockType: BlockType;
  name: string | null;
  prompt: string | null;
  videoPrompt: string | null;
  durationS: number;
  positionX: number;
  positionY: number;
  sortOrder: number;
  style: string | null;
  createdAt: Date;
  updatedAt: Date;
  mediaItems: BlockMediaItem[];
};

/** A directed edge between two storyboard blocks. */
export type StoryboardEdge = {
  id: string;
  draftId: string;
  sourceBlockId: string;
  targetBlockId: string;
};

/** A single checkpoint history entry (the list is pre-filtered to origin=checkpoint). */
export type StoryboardHistoryEntry = {
  id: number;
  draftId: string;
  snapshot: unknown;
  /**
   * 'screenshot' = snapshot carries an inline layout capture; 'minimap' = SVG
   * fallback after capture failure (AC-04). Null only for rows written before
   * the checkpoint feature — those are origin=legacy and never listed.
   */
  previewKind: 'screenshot' | 'minimap' | null;
  createdAt: Date;
};

/** Shape accepted by replaceStoryboard / insertBlock for block inserts. */
export type BlockInsert = {
  id: string;
  draftId: string;
  blockType: BlockType;
  name: string | null;
  prompt: string | null;
  videoPrompt: string | null;
  durationS: number;
  positionX: number;
  positionY: number;
  sortOrder: number;
  style: string | null;
  mediaItems?: BlockMediaItem[];
};

/** Shape accepted by replaceStoryboard for edge inserts. */
export type EdgeInsert = {
  id: string;
  draftId: string;
  sourceBlockId: string;
  targetBlockId: string;
};

// ── DB row types (internal) ───────────────────────────────────────────────────

export type BlockRow = RowDataPacket & {
  id: string;
  draft_id: string;
  block_type: BlockType;
  name: string | null;
  prompt: string | null;
  video_prompt: string | null;
  duration_s: number;
  position_x: number;
  position_y: number;
  sort_order: number;
  style: string | null;
  created_at: Date;
  updated_at: Date;
};

export type BlockMediaRow = RowDataPacket & {
  id: string;
  block_id: string;
  file_id: string | null;
  media_type: 'image' | 'video' | 'audio' | 'motion_graphic';
  sort_order: number;
  /** Joined columns from motion_graphic_block_snapshots (NULL for non-mg rows). */
  mg_snapshot_id: string | null;
  mg_code: string | null;
  mg_duration_seconds: string | number | null;
  mg_fps: number | null;
  mg_width: number | null;
  mg_height: number | null;
  mg_title: string | null;
};

/** Maps a raw block-media row to the public BlockMediaItem, hydrating the
 *  frozen motion-graphic snapshot when present. Shared by both read queries so
 *  they never drift. */
export function mapBlockMediaRow(m: BlockMediaRow): BlockMediaItem {
  const item: BlockMediaItem = {
    id: m.id,
    fileId: m.file_id,
    mediaType: m.media_type,
    sortOrder: m.sort_order,
  };
  if (m.media_type === 'motion_graphic' && m.mg_snapshot_id != null) {
    item.motionGraphic = {
      snapshotId: m.mg_snapshot_id,
      code: m.mg_code ?? '',
      durationSeconds: Number(m.mg_duration_seconds ?? 0),
      fps: Number(m.mg_fps ?? 0),
      width: Number(m.mg_width ?? 0),
      height: Number(m.mg_height ?? 0),
      title: m.mg_title,
    };
  }
  return item;
}

export type EdgeRow = RowDataPacket & {
  id: string;
  draft_id: string;
  source_block_id: string;
  target_block_id: string;
};

export type HistoryRow = RowDataPacket & {
  id: number;
  draft_id: string;
  snapshot: unknown;
  preview_kind: 'screenshot' | 'minimap' | null;
  created_at: Date;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

export function mapBlockRow(row: BlockRow, media: BlockMediaItem[]): StoryboardBlock {
  return {
    id: row.id,
    draftId: row.draft_id,
    blockType: row.block_type,
    name: row.name,
    prompt: row.prompt,
    videoPrompt: row.video_prompt,
    durationS: row.duration_s,
    positionX: row.position_x,
    positionY: row.position_y,
    sortOrder: row.sort_order,
    style: row.style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaItems: media,
  };
}

export function mapEdgeRow(row: EdgeRow): StoryboardEdge {
  return {
    id: row.id,
    draftId: row.draft_id,
    sourceBlockId: row.source_block_id,
    targetBlockId: row.target_block_id,
  };
}

export function mapHistoryRow(row: HistoryRow): StoryboardHistoryEntry {
  return {
    id: row.id,
    draftId: row.draft_id,
    snapshot:
      typeof row.snapshot === 'string'
        ? (JSON.parse(row.snapshot) as unknown)
        : row.snapshot,
    previewKind: row.preview_kind,
    createdAt: row.created_at,
  };
}
