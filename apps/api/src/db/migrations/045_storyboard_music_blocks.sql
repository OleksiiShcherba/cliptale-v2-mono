-- Migration: 045_storyboard_music_blocks
-- Persists storyboard background music blocks independently from story edges.
--
-- Music coverage is a logical scene range on the music block itself:
-- start_scene_block_id + end_scene_block_id. storyboard_edges remain the
-- one-in/one-out story sequence graph.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_music_generation_jobs;
--   DROP TABLE IF EXISTS storyboard_music_blocks;

CREATE TABLE IF NOT EXISTS storyboard_music_blocks (
  id                     CHAR(36)       NOT NULL,
  draft_id               CHAR(36)       NOT NULL,
  name                   VARCHAR(255)   NOT NULL,
  source_mode            ENUM(
                           'existing',
                           'generate_now',
                           'generate_on_step3'
                         )              NOT NULL DEFAULT 'generate_on_step3',
  prompt                 TEXT           NULL,
  composition_plan_json  JSON           NULL,
  existing_file_id       CHAR(36)       NULL,
  start_scene_block_id   CHAR(36)       NOT NULL,
  end_scene_block_id     CHAR(36)       NOT NULL,
  position_x             FLOAT          NOT NULL DEFAULT 0,
  position_y             FLOAT          NOT NULL DEFAULT 0,
  sort_order             INT            NOT NULL DEFAULT 0,
  volume                 DECIMAL(5,4)   NOT NULL DEFAULT 0.8000,
  fade_in_s              DECIMAL(8,3)   NOT NULL DEFAULT 0.000,
  fade_out_s             DECIMAL(8,3)   NOT NULL DEFAULT 0.000,
  loop_mode              ENUM('loop', 'trim') NOT NULL DEFAULT 'trim',
  created_at             DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                         ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_storyboard_music_blocks_draft_sort (draft_id, sort_order),
  KEY idx_storyboard_music_blocks_start_scene (start_scene_block_id),
  KEY idx_storyboard_music_blocks_end_scene (end_scene_block_id),
  KEY idx_storyboard_music_blocks_existing_file (existing_file_id),

  CONSTRAINT fk_storyboard_music_blocks_draft
    FOREIGN KEY (draft_id)
    REFERENCES generation_drafts(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_music_blocks_existing_file
    FOREIGN KEY (existing_file_id)
    REFERENCES files(file_id)
    ON DELETE SET NULL,

  CONSTRAINT fk_storyboard_music_blocks_start_scene
    FOREIGN KEY (start_scene_block_id)
    REFERENCES storyboard_blocks(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_music_blocks_end_scene
    FOREIGN KEY (end_scene_block_id)
    REFERENCES storyboard_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storyboard_music_generation_jobs (
  id              CHAR(36)     NOT NULL,
  draft_id        CHAR(36)     NOT NULL,
  music_block_id  CHAR(36)     NOT NULL,
  ai_job_id       CHAR(36)     NOT NULL,
  status          ENUM(
                    'queued',
                    'running',
                    'ready',
                    'failed'
                  )            NOT NULL DEFAULT 'queued',
  output_file_id  CHAR(36)     NULL,
  error_message   VARCHAR(512) NULL,
  active_lock     TINYINT(1)   NULL DEFAULT 1,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_storyboard_music_generation_ai_job (ai_job_id),
  UNIQUE KEY uq_storyboard_music_generation_active_block (draft_id, music_block_id, active_lock),
  KEY idx_storyboard_music_generation_draft_created (draft_id, created_at DESC),
  KEY idx_storyboard_music_generation_block_created (music_block_id, created_at DESC, id DESC),
  KEY idx_storyboard_music_generation_status (status),
  KEY idx_storyboard_music_generation_output_file (output_file_id),

  CONSTRAINT fk_storyboard_music_generation_draft
    FOREIGN KEY (draft_id)
    REFERENCES generation_drafts(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_music_generation_block
    FOREIGN KEY (music_block_id)
    REFERENCES storyboard_music_blocks(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_music_generation_ai_job
    FOREIGN KEY (ai_job_id)
    REFERENCES ai_generation_jobs(job_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_music_generation_output_file
    FOREIGN KEY (output_file_id)
    REFERENCES files(file_id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
