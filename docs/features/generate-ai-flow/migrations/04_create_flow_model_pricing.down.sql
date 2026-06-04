-- 04 (staged) — rollback: drop the pricing lookup. No other table references it (no FKs).
DROP TABLE IF EXISTS flow_model_pricing;
