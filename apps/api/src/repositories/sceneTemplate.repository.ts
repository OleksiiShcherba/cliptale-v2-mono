import { randomUUID } from 'node:crypto';

import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

// ── Domain types ──────────────────────────────────────────────────────────────

/** A single media attachment on a scene template. */
export type SceneTemplateMedia = {
  id: string;
  fileId: string;
  mediaType: 'image' | 'video' | 'audio';
  sortOrder: number;
};

/** A fully-hydrated scene template (includes mediaItems). */
export type SceneTemplate = {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  durationS: number;
  style: string | null;
  createdAt: Date;
  updatedAt: Date;
  mediaItems: SceneTemplateMedia[];
};

/** Fields accepted for creating or updating a scene template. */
export type SceneTemplateUpsert = {
  name: string;
  prompt: string;
  durationS: number;
  style: string | null;
  mediaItems: Array<{
    fileId: string;
    mediaType: 'image' | 'video' | 'audio';
    sortOrder: number;
  }>;
};

// ── Internal DB row types ─────────────────────────────────────────────────────

type TemplateRow = RowDataPacket & {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  duration_s: number;
  style: string | null;
  created_at: Date;
  updated_at: Date;
};

type TemplateMediaRow = RowDataPacket & {
  id: string;
  template_id: string;
  file_id: string;
  media_type: 'image' | 'video' | 'audio';
  sort_order: number;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapTemplateRow(row: TemplateRow, media: SceneTemplateMedia[]): SceneTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prompt: row.prompt,
    durationS: row.duration_s,
    style: row.style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaItems: media,
  };
}

// ── Connection helper ─────────────────────────────────────────────────────────

/** Acquire a pool connection for use in a caller-managed transaction. */
export async function getConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}

// ── Read queries ──────────────────────────────────────────────────────────────

/**
 * Returns all active (non-deleted) templates for a user, ordered by created_at DESC.
 * Each template is hydrated with its media items.
 */
export async function findTemplatesByUserId(userId: string): Promise<SceneTemplate[]> {
  const [rows] = await pool.execute<TemplateRow[]>(
    `SELECT id, user_id, name, prompt, duration_s, style, created_at, updated_at
     FROM scene_templates
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );

  if (rows.length === 0) return [];

  const templateIds = rows.map((r) => r.id);
  const placeholders = templateIds.map(() => '?').join(', ');

  const [mediaRows] = await pool.execute<TemplateMediaRow[]>(
    `SELECT id, template_id, file_id, media_type, sort_order
     FROM scene_template_media
     WHERE template_id IN (${placeholders})
     ORDER BY sort_order ASC`,
    templateIds,
  );

  const mediaByTemplate = new Map<string, SceneTemplateMedia[]>();
  for (const m of mediaRows) {
    const existing = mediaByTemplate.get(m.template_id) ?? [];
    existing.push({
      id: m.id,
      fileId: m.file_id,
      mediaType: m.media_type,
      sortOrder: m.sort_order,
    });
    mediaByTemplate.set(m.template_id, existing);
  }

  return rows.map((r) => mapTemplateRow(r, mediaByTemplate.get(r.id) ?? []));
}

/**
 * Returns a single active template by id, or null if not found or soft-deleted.
 */
export async function findTemplateById(id: string): Promise<SceneTemplate | null> {
  const [rows] = await pool.execute<TemplateRow[]>(
    `SELECT id, user_id, name, prompt, duration_s, style, created_at, updated_at
     FROM scene_templates
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );

  if (rows.length === 0) return null;

  const row = rows[0]!;

  const [mediaRows] = await pool.execute<TemplateMediaRow[]>(
    `SELECT id, template_id, file_id, media_type, sort_order
     FROM scene_template_media
     WHERE template_id = ?
     ORDER BY sort_order ASC`,
    [id],
  );

  const media: SceneTemplateMedia[] = mediaRows.map((m) => ({
    id: m.id,
    fileId: m.file_id,
    mediaType: m.media_type,
    sortOrder: m.sort_order,
  }));

  return mapTemplateRow(row, media);
}

// ── Write queries ─────────────────────────────────────────────────────────────

/**
 * Inserts a new scene template and its media items.
 * Media items are inserted inside the same caller-managed transaction.
 *
 * Returns the id of the newly created template.
 */
export async function insertTemplate(
  conn: PoolConnection,
  userId: string,
  data: SceneTemplateUpsert,
): Promise<string> {
  const id = randomUUID();

  await conn.execute<ResultSetHeader>(
    `INSERT INTO scene_templates (id, user_id, name, prompt, duration_s, style)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, data.name, data.prompt, data.durationS, data.style],
  );

  for (const m of data.mediaItems) {
    await conn.execute<ResultSetHeader>(
      `INSERT INTO scene_template_media (id, template_id, file_id, media_type, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), id, m.fileId, m.mediaType, m.sortOrder],
    );
  }

  return id;
}

/**
 * Updates a template's scalar fields and atomically replaces its media list.
 *
 * Must be called inside a caller-managed transaction.
 */
export async function updateTemplate(
  conn: PoolConnection,
  id: string,
  data: SceneTemplateUpsert,
): Promise<void> {
  await conn.execute<ResultSetHeader>(
    `UPDATE scene_templates
     SET name = ?, prompt = ?, duration_s = ?, style = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [data.name, data.prompt, data.durationS, data.style, id],
  );

  // Replace media: delete existing, insert new.
  await conn.execute<ResultSetHeader>(
    'DELETE FROM scene_template_media WHERE template_id = ?',
    [id],
  );

  for (const m of data.mediaItems) {
    await conn.execute<ResultSetHeader>(
      `INSERT INTO scene_template_media (id, template_id, file_id, media_type, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), id, m.fileId, m.mediaType, m.sortOrder],
    );
  }
}

/**
 * Soft-deletes a template by setting deleted_at = NOW().
 *
 * Returns true when a row was matched and updated, false when the template
 * was not found or was already deleted.
 */
export async function softDeleteTemplate(id: string, userId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE scene_templates
     SET deleted_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  return result.affectedRows > 0;
}

/** Generates a new UUID. Exported so services can create IDs without importing node:crypto. */
export function newId(): string {
  return randomUUID();
}
