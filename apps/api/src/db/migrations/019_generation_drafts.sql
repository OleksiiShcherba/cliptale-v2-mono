-- Migration: 019_generation_drafts
-- Creates the generation_drafts table that persists wizard prompt documents
-- as the user works through the video-generation wizard (Step 1 → Script & Media).
-- Each row belongs to exactly one user and holds a PromptDoc JSON document plus
-- a status that tracks wizard progression.
--
-- Manual rollback:
--   DROP TABLE generation_drafts;
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS generation_drafts (
  id          CHAR(36)      NOT NULL,
  user_id     CHAR(36)      NOT NULL,
  prompt_doc  JSON          NOT NULL,
  status      ENUM(
                'draft',
                'step2',
                'step3',
                'completed'
              )             NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_generation_drafts_user_updated (user_id, updated_at DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
