/**
 * Shared types and internal DB row mappers for storyboard.repository.ts.
 * Extracted to keep the repository file under the 300-line cap.
 */

import type { RowDataPacket } from 'mysql2/promise';

// ── Public domain types ───────────────────────────────────────────────────────

/** Valid block_type values matching the storyboard_blocks ENUM. */
export type BlockType = 'start' | 'end' | 'scene';

/** A single media attachment on a storyboard block. */
export type BlockMediaItem = {
  id: string;
  fileId: string;
  mediaType: 'image' | 'video' | 'audio';
  sortOrder: number;
};

/** A fully-hydrated storyboard block (includes mediaItems). */
export type StoryboardBlock = {
  id: string;
  draftId: string;
  blockType: BlockType;
  name: string | null;
  prompt: string | null;
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

/** A single history snapshot row. */
export type StoryboardHistoryEntry = {
  id: number;
  draftId: string;
  snapshot: unknown;
  createdAt: Date;
};

/** Shape accepted by replaceStoryboard / insertBlock for block inserts. */
export type BlockInsert = {
  id: string;
  draftId: string;
  blockType: BlockType;
  name: string | null;
  prompt: string | null;
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
  file_id: string;
  media_type: 'image' | 'video' | 'audio';
  sort_order: number;
};

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
    createdAt: row.created_at,
  };
}
