-- Rollback (STAGED, DEFERRED): 01_drop_storyboard_illustration_references.down
--
-- Restores the storyboard_illustration_references SCHEMA exactly as it stood after
-- migrations 040 + 041 (base table + approval columns). ⚠️ Data is NOT restored —
-- the up-migration's DROP is lossy by design; by promote time the rows are inert
-- legacy (ignored on read since ADR-0004 shipped).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS storyboard_illustration_references (
  id                        CHAR(36)     NOT NULL,
  draft_id                  CHAR(36)     NOT NULL,
  ai_job_id                 CHAR(36)     NOT NULL,
  status                    ENUM(
                              'queued',
                              'running',
                              'ready',
                              'failed'
                            )            NOT NULL DEFAULT 'queued',
  output_file_id            CHAR(36)     NULL,
  source_reference_file_ids JSON         NOT NULL,
  error_message             VARCHAR(512) NULL,
  active_lock               TINYINT(1)   NULL DEFAULT 1,
  approval_status           ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
  approved_at               DATETIME(3)  NULL,
  created_at                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                          ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_storyboard_illustration_reference_ai_job (ai_job_id),
  UNIQUE KEY uq_storyboard_illustration_reference_active_draft (draft_id, active_lock),
  KEY idx_storyboard_illustration_reference_draft_created (draft_id, created_at DESC),
  KEY idx_storyboard_illustration_reference_status (status),
  KEY idx_storyboard_illustration_reference_output_file (output_file_id),

  CONSTRAINT fk_storyboard_illustration_reference_draft
    FOREIGN KEY (draft_id)
    REFERENCES generation_drafts(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_illustration_reference_ai_job
    FOREIGN KEY (ai_job_id)
    REFERENCES ai_generation_jobs(job_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_illustration_reference_output_file
    FOREIGN KEY (output_file_id)
    REFERENCES files(file_id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
