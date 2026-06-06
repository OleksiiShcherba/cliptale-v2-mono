-- Migration: 050_create_user_settings
-- (promoted from docs/features/storyboard-autosave-checkpoints/migrations/01_create_user_settings.up.sql)
--
-- Creates the `user_settings` table — the per-account preferences store (ADR-0004).
-- First field: autosave interval for storyboard checkpoints; future preferences are
-- added as JSON fields without DDL.
--
-- Design notes:
--   - PK user_id (one row per user); the row is created lazily on the user's first
--     write from the Settings page — no row means app-layer defaults (60 s, AC-11b).
--   - settings_json is untyped JSON (precedent: user_project_ui_state, 028): the
--     shape is owned by the app layer; the interval preset whitelist
--     (30/60/120/300/600 s) is validated by Zod, not the DB.
--   - FK ON DELETE CASCADE so deleting a user removes their settings row; the PK
--     itself covers the FK column — no extra index needed.
--   - updated_at uses ON UPDATE CURRENT_TIMESTAMP(3) so the application never sets
--     it manually (same as 028).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to re-run.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS user_settings;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id        CHAR(36)    NOT NULL,
  settings_json  JSON        NOT NULL,
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (user_id),

  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
