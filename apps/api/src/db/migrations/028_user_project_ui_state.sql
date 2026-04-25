-- Migration: 028_user_project_ui_state
-- Creates the user_project_ui_state table — a per-user, per-project store for
-- ephemeral timeline UI state: zoom level, scroll position, playhead frame,
-- and any other transient editor state the frontend wants to persist across
-- sessions.
--
-- Design notes:
--   - Composite PK (user_id, project_id) — one row per user-project pair.
--   - state_json is untyped JSON: the shape belongs to the frontend (web-editor)
--     and can evolve independently of the API schema.
--   - FKs use ON DELETE CASCADE so that deleting a user or project automatically
--     removes the associated UI state row. No orphaned rows are possible.
--   - updated_at uses ON UPDATE CURRENT_TIMESTAMP(3) so the application never
--     needs to set it manually.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to re-run.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS user_project_ui_state;

CREATE TABLE IF NOT EXISTS user_project_ui_state (
  user_id     CHAR(36)    NOT NULL,
  project_id  CHAR(36)    NOT NULL,
  state_json  JSON        NOT NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                          ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (user_id, project_id),

  CONSTRAINT fk_upuis_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_upuis_project
    FOREIGN KEY (project_id)
    REFERENCES projects(project_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
