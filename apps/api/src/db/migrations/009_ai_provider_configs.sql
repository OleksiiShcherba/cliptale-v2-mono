-- Migration: 009_ai_provider_configs
-- Creates the ai_provider_configs table for storing per-user AI provider API keys.
-- API keys are encrypted with AES-256-GCM; the encrypted bytes, IV, and auth tag
-- are stored alongside the config row.
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

-- DOWN (for rollback):
-- DROP TABLE IF EXISTS ai_provider_configs;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  config_id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id           CHAR(36)        NOT NULL,
  provider          ENUM(
                      'openai',
                      'runway',
                      'stability_ai',
                      'elevenlabs',
                      'kling',
                      'pika',
                      'suno',
                      'replicate'
                    )               NOT NULL,
  api_key_encrypted VARBINARY(512)  NOT NULL,
  encryption_iv     VARBINARY(16)   NOT NULL,
  encryption_tag    VARBINARY(16)   NOT NULL,
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (config_id),
  UNIQUE INDEX idx_ai_provider_configs_user_provider (user_id, provider),
  INDEX idx_ai_provider_configs_user_id (user_id),
  CONSTRAINT fk_ai_provider_configs_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
