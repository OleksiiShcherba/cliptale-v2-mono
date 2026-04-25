-- Migration: 016_user_voices
-- Creates the user_voices table for storing ElevenLabs cloned voice records.
--
-- Voices are user-scoped (not project-scoped): once cloned, a voice can be
-- referenced in any text_to_speech or speech_to_speech job for the same user.
-- The ElevenLabs voice_id is stored alongside an internal UUID so the platform
-- owns the identity; the ElevenLabs ID is a lookup key, not a primary key.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.
--
-- DOWN (rollback):
-- DROP TABLE IF EXISTS user_voices;

CREATE TABLE IF NOT EXISTS user_voices (
  voice_id              CHAR(36)        NOT NULL,
  user_id               CHAR(36)        NOT NULL,
  label                 VARCHAR(200)    NOT NULL,
  elevenlabs_voice_id   VARCHAR(100)    NOT NULL,
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (voice_id),
  INDEX idx_user_voices_user_id (user_id),
  CONSTRAINT fk_user_voices_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
