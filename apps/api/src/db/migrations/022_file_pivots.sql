-- Migration: 022_file_pivots
-- Creates the pivot tables that link files to their containers:
--   project_files  — links a file to a project
--   draft_files    — links a file to a generation draft
--
-- FK delete semantics (by design):
--   ON DELETE CASCADE  on the container side (project / draft): deleting a project
--     or draft automatically unlinks its files; the file rows themselves are
--     NOT deleted (files are user-owned, not container-owned).
--   ON DELETE RESTRICT on the file side: a file cannot be hard-deleted while it is
--     still linked to any project or draft.  The application must unlink first.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to run multiple times.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS draft_files;
--   DROP TABLE IF EXISTS project_files;

-- ── project_files ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  project_id  CHAR(36)    NOT NULL,
  file_id     CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (project_id, file_id),

  CONSTRAINT fk_project_files_project
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_project_files_file
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ── draft_files ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS draft_files (
  draft_id    CHAR(36)    NOT NULL,
  file_id     CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (draft_id, file_id),

  CONSTRAINT fk_draft_files_draft
    FOREIGN KEY (draft_id) REFERENCES generation_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_draft_files_file
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
