-- Migration: 013_drop_ai_provider_configs
-- Drops the ai_provider_configs table. This table previously stored encrypted
-- per-user API keys for a multi-provider "bring your own key" integration. The
-- product has moved to a single server-side fal.ai integration, so per-user
-- key storage is no longer part of the schema.
-- Idempotent: safe to run multiple times (DROP TABLE IF EXISTS).

-- DOWN (for rollback):
-- (no-op — table is gone permanently; see migration 009 for the original shape)

DROP TABLE IF EXISTS ai_provider_configs;
