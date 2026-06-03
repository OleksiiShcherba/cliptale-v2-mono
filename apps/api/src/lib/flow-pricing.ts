/**
 * T9 — static per-model price table (ADR-0005 / AC-11).
 *
 * This module holds a static, compile-time estimate of the cost (in USD) for one
 * generation run of each supported AI model. Prices are best-effort approximations
 * based on public pricing at the time of writing; they are NOT authoritative and
 * are reconciled against actuals out of band.
 *
 * Design:
 *  - Plain TypeScript — zero runtime dependencies, zero network access.
 *  - `FLOW_PRICE_TABLE` is a `Record<string, number>` keyed by the model id
 *    (same id as in packages/api-contracts AI_MODELS catalog).
 *  - `getPriceForModel(modelId)` returns the known price or `undefined` for
 *    unknown models (the service layer maps unknown → 0 amount, bestEffort: true).
 *
 * Updating prices: edit the values below. Add new model ids as they are added to
 * the catalog (packages/api-contracts/src/fal-models.ts + elevenlabs-models.ts).
 */

/**
 * Static per-model USD price table.
 *
 * Sources (best-effort, 2026-06-03):
 *  - fal.ai video models: https://fal.ai/pricing (per-run estimates)
 *  - ElevenLabs audio: https://elevenlabs.io/pricing (character-based; flat per-run proxy)
 *
 * Each value is the estimated cost in USD for a single typical generation run.
 * `0.00` means the provider charges per-output-token/character but cost is near-zero
 * at typical usage; the service will still surface bestEffort: true.
 */
export const FLOW_PRICE_TABLE: Readonly<Record<string, number>> = {
  // ── fal.ai image-to-video ─────────────────────────────────────────────────
  'fal-ai/ltx-2-19b/image-to-video': 0.05,
  'fal-ai/kling-video/o3/standard/image-to-video': 0.28,
  'fal-ai/pixverse/v6/image-to-video': 0.35,
  'fal-ai/wan/v2.2-a14b/image-to-video': 0.12,

  // ── fal.ai text-to-video ──────────────────────────────────────────────────
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': 0.45,

  // ── fal.ai image-edit ─────────────────────────────────────────────────────
  'fal-ai/nano-banana-2/edit': 0.04,
  'fal-ai/gpt-image-1.5/edit': 0.04,

  // ── fal.ai text-to-image ──────────────────────────────────────────────────
  'fal-ai/nano-banana-2': 0.03,
  'openai/gpt-image-2': 0.04,
  'fal-ai/gpt-image-1.5': 0.04,

  // ── ElevenLabs audio ─────────────────────────────────────────────────────
  'elevenlabs/text-to-speech': 0.02,
  'elevenlabs/voice-cloning': 0.05,
  'elevenlabs/speech-to-speech': 0.03,
  'elevenlabs/music-generation': 0.08,
} as const;

/**
 * Returns the estimated USD price for a single generation run of `modelId`,
 * or `undefined` when the model is not in the static table.
 *
 * Callers should treat an `undefined` result as "price unknown" and still
 * surface a best-effort estimate with amount 0 (spec AC-11 / openapi).
 */
export function getPriceForModel(modelId: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(FLOW_PRICE_TABLE, modelId)
    ? FLOW_PRICE_TABLE[modelId]
    : undefined;
}
