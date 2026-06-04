-- 04 (staged) — flow_model_pricing: DB-adjustable, parameter-reactive pricing (ADR-0008, AC-20).
-- Promotes to the live migrations tree as the next sequence number.
--
-- One row per catalog model id (packages/api-contracts AI_MODELS). No FK: the model
-- catalog lives in code, not in a table (same reasoning as ai_generation_jobs.model_id).
-- Seeded below from the static FLOW_PRICE_TABLE (apps/api/src/lib/flow-pricing.ts,
-- values as of 2026-06-04) — flat price becomes base_amount, factor columns stay NULL,
-- so day-one estimates are byte-identical until an operator edits a row.

CREATE TABLE IF NOT EXISTS flow_model_pricing (
  model_id        VARCHAR(191)  NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',
  base_amount     DECIMAL(10,4) NOT NULL,
  per_second      DECIMAL(10,6) NULL DEFAULT NULL,
  per_image       DECIMAL(10,6) NULL DEFAULT NULL,
  resolution_mult JSON          NULL DEFAULT NULL,
  updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (model_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Seed: verbatim FLOW_PRICE_TABLE (2026-06-04). INSERT IGNORE keeps re-runs idempotent.
INSERT IGNORE INTO flow_model_pricing (model_id, base_amount) VALUES
  -- fal.ai image-to-video
  ('fal-ai/ltx-2-19b/image-to-video',                 0.05),
  ('fal-ai/kling-video/o3/standard/image-to-video',   0.28),
  ('fal-ai/pixverse/v6/image-to-video',               0.35),
  ('fal-ai/wan/v2.2-a14b/image-to-video',             0.12),
  -- fal.ai text-to-video
  ('fal-ai/kling-video/v2.5-turbo/pro/text-to-video', 0.45),
  -- fal.ai image-edit
  ('fal-ai/nano-banana-2/edit',                       0.04),
  ('fal-ai/gpt-image-1.5/edit',                       0.04),
  -- fal.ai text-to-image
  ('fal-ai/nano-banana-2',                            0.03),
  ('openai/gpt-image-2',                              0.04),
  ('fal-ai/gpt-image-1.5',                            0.04),
  -- ElevenLabs audio
  ('elevenlabs/text-to-speech',                       0.02),
  ('elevenlabs/voice-cloning',                        0.05),
  ('elevenlabs/speech-to-speech',                     0.03),
  ('elevenlabs/music-generation',                     0.08);
