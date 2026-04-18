/**
 * Smoke tests for `insertClip` and `getClipByIdAndProject` in clip.repository.ts.
 *
 * These tests mock the mysql2 pool so no real DB is required.
 * They exercise the round-trip path for a `caption` clip type to verify that
 * the DB ENUM migration (C4) has been wired correctly — if the `caption` literal
 * were not present in `ClipInsert.type`, TypeScript would catch it at compile
 * time and these tests would fail to compile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

// ── Mock the DB connection pool ───────────────────────────────────────────────
// vi.hoisted ensures mockExecute is available when the vi.mock factory runs.
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  insertClip,
  getClipByIdAndProject,
  type ClipInsert,
  type ClipRow,
} from './clip.repository.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a ClipDbRow as returned by mysql2 (snake_case columns). */
function makeClipDbRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    clip_id: 'clip-uuid-001',
    project_id: 'proj-uuid-001',
    track_id: 'track-uuid-001',
    type: 'caption',
    start_frame: 0,
    duration_frames: 90,
    trim_in_frames: 0,
    trim_out_frames: null,
    transform_json: null,
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** A minimal valid caption clip insert payload. */
const CAPTION_CLIP_INSERT: ClipInsert = {
  clipId: 'clip-uuid-001',
  projectId: 'proj-uuid-001',
  trackId: 'track-uuid-001',
  type: 'caption',
  startFrame: 0,
  durationFrames: 90,
};

// ── insertClip ────────────────────────────────────────────────────────────────

describe('clip.repository — insertClip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes an INSERT with the correct SQL for a caption clip', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT\s+INTO\s+project_clips_current/i);
  });

  it('passes the caption type literal as the fourth positional parameter', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    // params: [clipId, projectId, trackId, type, fileId, startFrame, durationFrames, trimIn, trimOut, layer]
    expect(params[3]).toBe('caption');
  });

  it('sets fileId to null when not provided in ClipInsert', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBeNull();
  });

  it('defaults trimInFrames to 0 when omitted', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[7]).toBe(0);
  });

  it('defaults trimOutFrames to null when omitted', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[8]).toBeNull();
  });

  it('defaults layer to 0 when omitted', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[9]).toBe(0);
  });

  it('accepts explicit fileId, trimInFrames, trimOutFrames, and layer', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip({
      ...CAPTION_CLIP_INSERT,
      fileId: 'file-uuid-001',
      trimInFrames: 5,
      trimOutFrames: 80,
      layer: 2,
    });

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe('file-uuid-001');
    expect(params[7]).toBe(5);
    expect(params[8]).toBe(80);
    expect(params[9]).toBe(2);
  });

  it('propagates DB errors so BullMQ / callers can retry', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB constraint violation'));

    await expect(insertClip(CAPTION_CLIP_INSERT)).rejects.toThrow('DB constraint violation');
  });

  it('accepts all valid clip type literals', async () => {
    const types: ClipInsert['type'][] = ['video', 'audio', 'text-overlay', 'image', 'caption'];

    for (const type of types) {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);
      await expect(insertClip({ ...CAPTION_CLIP_INSERT, type })).resolves.toBeUndefined();
      const [, params] = mockExecute.mock.calls[mockExecute.mock.calls.length - 1] as [string, unknown[]];
      expect(params[3]).toBe(type);
    }
  });
});

// ── getClipByIdAndProject ─────────────────────────────────────────────────────

describe('clip.repository — getClipByIdAndProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mapped ClipRow when the clip exists', async () => {
    const dbRow = makeClipDbRow();
    mockExecute.mockResolvedValueOnce([[dbRow], []]);

    const result = await getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001');

    expect(result).not.toBeNull();
    const clip = result as ClipRow;
    expect(clip.clipId).toBe('clip-uuid-001');
    expect(clip.projectId).toBe('proj-uuid-001');
    expect(clip.trackId).toBe('track-uuid-001');
    expect(clip.startFrame).toBe(0);
    expect(clip.durationFrames).toBe(90);
    expect(clip.trimInFrames).toBe(0);
    expect(clip.trimOutFrames).toBeNull();
    expect(clip.transform).toBeNull();
  });

  it('returns null when no matching clip is found', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await getClipByIdAndProject('nonexistent-id', 'proj-uuid-001');

    expect(result).toBeNull();
  });

  it('scopes the SELECT to both clipId and projectId', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+clip_id\s*=\s*\?/i);
    expect(sql).toMatch(/AND\s+project_id\s*=\s*\?/i);
    expect(params).toEqual(['clip-uuid-001', 'proj-uuid-001']);
  });

  it('parses transform_json string into an object when stored as JSON string', async () => {
    const dbRow = makeClipDbRow({ transform_json: JSON.stringify({ x: 10, y: 20 }) });
    mockExecute.mockResolvedValueOnce([[dbRow], []]);

    const result = await getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001');

    expect(result?.transform).toEqual({ x: 10, y: 20 });
  });

  it('parses transform_json when already an object (mysql2 auto-parse)', async () => {
    const dbRow = makeClipDbRow({ transform_json: { x: 5, y: 15 } });
    mockExecute.mockResolvedValueOnce([[dbRow], []]);

    const result = await getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001');

    expect(result?.transform).toEqual({ x: 5, y: 15 });
  });

  it('sets trimOutFrames to null when the DB column is null', async () => {
    const dbRow = makeClipDbRow({ trim_out_frames: null });
    mockExecute.mockResolvedValueOnce([[dbRow], []]);

    const result = await getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001');

    expect(result?.trimOutFrames).toBeNull();
  });

  it('propagates DB errors', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB read timeout'));

    await expect(getClipByIdAndProject('clip-uuid-001', 'proj-uuid-001')).rejects.toThrow(
      'DB read timeout',
    );
  });
});

// ── Round-trip smoke test ─────────────────────────────────────────────────────

describe('clip.repository — caption clip round-trip smoke test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips a caption clip: insert then read back the same fields', async () => {
    // 1. insertClip — resolves void
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await insertClip(CAPTION_CLIP_INSERT);

    expect(mockExecute).toHaveBeenCalledOnce();
    const [insertSql, insertParams] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(insertSql).toMatch(/INSERT/i);
    // The type written to DB must be the 'caption' literal (ENUM value from C4 migration).
    expect(insertParams[3]).toBe('caption');

    // 2. getClipByIdAndProject — returns what the DB would store
    const dbRow = makeClipDbRow({
      clip_id: CAPTION_CLIP_INSERT.clipId,
      project_id: CAPTION_CLIP_INSERT.projectId,
      track_id: CAPTION_CLIP_INSERT.trackId,
      start_frame: CAPTION_CLIP_INSERT.startFrame,
      duration_frames: CAPTION_CLIP_INSERT.durationFrames,
    });
    mockExecute.mockResolvedValueOnce([[dbRow], []]);

    const readBack = await getClipByIdAndProject(
      CAPTION_CLIP_INSERT.clipId,
      CAPTION_CLIP_INSERT.projectId,
    );

    expect(readBack).not.toBeNull();
    expect(readBack?.clipId).toBe(CAPTION_CLIP_INSERT.clipId);
    expect(readBack?.projectId).toBe(CAPTION_CLIP_INSERT.projectId);
    expect(readBack?.trackId).toBe(CAPTION_CLIP_INSERT.trackId);
    expect(readBack?.startFrame).toBe(CAPTION_CLIP_INSERT.startFrame);
    expect(readBack?.durationFrames).toBe(CAPTION_CLIP_INSERT.durationFrames);
  });
});
