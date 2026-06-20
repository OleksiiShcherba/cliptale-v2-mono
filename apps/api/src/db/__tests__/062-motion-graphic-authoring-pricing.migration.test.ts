/**
 * Integration test — migration 062_seed_motion_graphic_authoring_pricing.sql
 *
 * Guards the LOAD-BEARING pricing seed for the Motion Graphic authoring cost gate
 * (review 2026-06-20 stage-2 finding). The cost gate (motionGraphic.cost.service)
 * recomputes the generation estimate server-side as `per_second × durationSeconds`
 * and re-validates the client's `acknowledgedCost` under an EXACT-match rule. The
 * client mirror (apps/web-editor .../cost.ts `MOTION_GRAPHIC_COST_PER_SECOND`) charges
 * 0.01 USD/second. If the seeded `per_second` ever drifts from that constant — a model
 * rename, a missing row, a re-tuned rate — the server estimate stops matching the client
 * and EVERY generate/refine is rejected `motion_graphic.estimate_revalidation_failed` (422),
 * silently breaking the entire live authoring path (AC-01 / AC-11).
 *
 * This test pins the two together: the seed MUST provide per_second = 0.010000 for the
 * configured authoring models so the server estimate equals the client mirror.
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/062-motion-graphic-authoring-pricing.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '062_seed_motion_graphic_authoring_pricing.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'flow_model_pricing';
const DB_NAME = 'cliptale';

// The per-second authoring rate the client mirror sends as `acknowledgedCost`.
// MUST equal apps/web-editor/src/features/motion-graphic/cost.ts MOTION_GRAPHIC_COST_PER_SECOND.
const EXPECTED_PER_SECOND = '0.010000';
const AUTHORING_MODEL_IDS = ['gpt-4o', 'gpt-4o-mini'];

let conn: mysql.Connection;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: DB_NAME,
    user: 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
});

afterAll(async () => {
  await conn.end();
});

describe('migration 062 — motion graphic authoring pricing seed', () => {
  it('live file exists at apps/api/src/db/migrations/062_seed_motion_graphic_authoring_pricing.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the seed without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('seeds per_second = 0.010000 for every authoring model (server estimate == client mirror)', async () => {
    const placeholders = AUTHORING_MODEL_IDS.map(() => '?').join(', ');
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT model_id, per_second
         FROM ${TABLE_NAME}
        WHERE model_id IN (${placeholders})`,
      AUTHORING_MODEL_IDS,
    );
    const byModel = Object.fromEntries(rows.map((r) => [r['model_id'], r]));
    for (const modelId of AUTHORING_MODEL_IDS) {
      expect(byModel[modelId], `pricing row for ${modelId} must be seeded`).toBeDefined();
      expect(String(byModel[modelId]!['per_second'])).toBe(EXPECTED_PER_SECOND);
    }
  });

  it('runPendingMigrations() is idempotent (INSERT IGNORE — no duplicate/clobber on re-run)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT per_second FROM ${TABLE_NAME} WHERE model_id = 'gpt-4o'`,
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!['per_second'])).toBe(EXPECTED_PER_SECOND);
  });
});
