-- Migration: 012_add_result_url_to_ai_jobs
-- Adds result_url column for storing the S3 URL of generated content.
-- result_asset_id remains for future use when the generated file is registered as a project asset.
ALTER TABLE ai_generation_jobs
  ADD COLUMN result_url VARCHAR(512) NULL AFTER result_asset_id;
