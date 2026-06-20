-- 062 — seed flow_model_pricing for the Motion Graphic authoring model (ADR-0002 revised, AC-11).
--
-- The cost gate (motionGraphic.cost.service) recomputes the generation estimate SERVER-SIDE
-- by looking up the configured authoring model id (`config.openai.model`, default `gpt-4o`)
-- in flow_model_pricing, and re-validates the client's `acknowledgedCost` under an EXACT-match
-- rule. The client mirror (apps/web-editor .../cost.ts) charges 0.01 USD per animation second.
--
-- Without a pricing row the server fell back to 0.0000 while the client showed 0.01 × duration,
-- so EVERY generate/refine was rejected with `motion_graphic.estimate_revalidation_failed` (422).
-- This seed makes the two agree: per_second 0.01 → server estimate == client estimate.
--
-- INSERT IGNORE keeps re-runs idempotent and never clobbers an operator-tuned row.
INSERT IGNORE INTO flow_model_pricing (model_id, base_amount, per_second) VALUES
  ('gpt-4o',      0.01, 0.010000),
  ('gpt-4o-mini', 0.01, 0.010000);
