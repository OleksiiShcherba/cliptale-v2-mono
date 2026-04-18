-- Migration: 015_ai_jobs_audio_capabilities
-- Extends the capability ENUM in ai_generation_jobs to include ElevenLabs
-- audio capabilities: text_to_speech, voice_cloning, speech_to_speech,
-- music_generation.
--
-- Strategy: ALTER TABLE MODIFY COLUMN guarded by an INFORMATION_SCHEMA check.
-- We check whether 'text_to_speech' is already present in the COLUMN_TYPE;
-- if not, we widen the ENUM. This avoids the DROP+CREATE pattern which can
-- silently fail in docker-entrypoint-initdb.d because CREATE TABLE IF NOT EXISTS
-- is a no-op when the table already exists (14's DROP + 15's CREATE race).
--
-- Idempotent: safe to run multiple times. On re-run the INFORMATION_SCHEMA guard
-- returns 1 (already widened) and the ALTER is skipped.

-- ── Widen capability ENUM ─────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_enum_already_wide
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'capability'
   AND COLUMN_TYPE LIKE '%text_to_speech%';

SET @_sql_widen_enum = IF(
  @_enum_already_wide = 0,
  'ALTER TABLE ai_generation_jobs MODIFY COLUMN capability ENUM(
    ''text_to_image'',
    ''image_edit'',
    ''text_to_video'',
    ''image_to_video'',
    ''text_to_speech'',
    ''voice_cloning'',
    ''speech_to_speech'',
    ''music_generation''
  ) NOT NULL',
  'SELECT 1 /* ai_generation_jobs.capability ENUM already includes text_to_speech */'
);

PREPARE _stmt FROM @_sql_widen_enum;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
