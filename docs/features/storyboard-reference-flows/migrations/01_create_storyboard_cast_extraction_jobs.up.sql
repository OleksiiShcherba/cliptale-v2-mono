-- Migration: 01_create_storyboard_cast_extraction_jobs
-- (staged — promoted by `implement` to apps/api/src/db/migrations/052_*.sql)
--
-- Tracks the async cast-extract job lifecycle (ADR-0002: new job type on the
-- storyboard-plan queue) and stores the AI-proposed cast JSON (proposal_json)
-- after completion. Multiple rows per draft are allowed (failed-then-retry).
-- The AC-01b gate ("don't offer re-extraction once confirmed") is enforced in
-- the service layer — checked via storyboard_reference_blocks row count.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_cast_extraction_jobs;

CREATE TABLE IF NOT EXISTS storyboard_cast_extraction_jobs (
  id                          CHAR(36)      NOT NULL,
  draft_id                    CHAR(36)      NOT NULL,
  user_id                     CHAR(36)      NOT NULL,
  status                      ENUM(
                                'queued',
                                'running',
                                'completed',
                                'failed'
                              )             NOT NULL DEFAULT 'queued',
  proposal_json               JSON          NULL,
  aggregate_estimate_credits  DECIMAL(10,4) NULL,
  error_message               VARCHAR(512)  NULL,
  completed_at                DATETIME(3)   NULL,
  failed_at                   DATETIME(3)   NULL,
  created_at                  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                            ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- Serves "latest extraction job for draft" — API reads proposal after worker completes (Flow 1)
  KEY idx_storyboard_cast_extraction_draft_created (draft_id, created_at DESC),
  -- FK index requirement for fk_storyboard_cast_extraction_user
  KEY idx_storyboard_cast_extraction_user (user_id),

  CONSTRAINT fk_storyboard_cast_extraction_draft
    FOREIGN KEY (draft_id) REFERENCES generation_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_cast_extraction_user
    FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
