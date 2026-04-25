-- Migration: 003_project_versions
-- Creates the projects table and version history tables:
--   projects             — root project record with optimistic-lock pointer
--   project_versions     — full document snapshots (doc_json) per save
--   project_version_patches — Immer forward/inverse patch pairs per version
--   project_audit_log    — append-only audit trail (save, restore, etc.)
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS projects (
  project_id        CHAR(36)            NOT NULL,
  latest_version_id BIGINT UNSIGNED     NULL,
  created_at        DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (project_id),
  INDEX idx_projects_project_id (project_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_versions (
  version_id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  project_id          CHAR(36)          NOT NULL,
  doc_json            JSON              NOT NULL,
  doc_schema_version  INT               NOT NULL DEFAULT 1,
  created_by_user_id  VARCHAR(255)      NULL,
  created_at          DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  parent_version_id   BIGINT UNSIGNED   NULL,

  PRIMARY KEY (version_id),
  INDEX idx_project_versions_project_created (project_id, created_at DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_version_patches (
  patch_id              BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  version_id            BIGINT UNSIGNED   NOT NULL,
  patches_json          JSON              NOT NULL,
  inverse_patches_json  JSON              NOT NULL,

  PRIMARY KEY (patch_id),
  INDEX idx_version_patches_version_id (version_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_audit_log (
  log_id      BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  project_id  CHAR(36)          NOT NULL,
  event_type  VARCHAR(64)       NOT NULL,
  version_id  BIGINT UNSIGNED   NULL,
  user_id     VARCHAR(255)      NULL,
  created_at  DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (log_id),
  INDEX idx_audit_log_project_created (project_id, created_at DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
