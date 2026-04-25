/**
 * BullMQ job handler for `ai-enhance` jobs.
 *
 * Strategy — sentinel-splice:
 *   1. Replace every `media-ref` block in the PromptDoc with `{{MEDIA_N}}`.
 *   2. Send the text-only serialization to OpenAI chat completions.
 *   3. Validate that the LLM preserved every sentinel exactly once, in order.
 *   4. Splice the original media-ref blocks back in at the sentinel positions.
 *   5. Validate the result against `promptDocSchema`.
 *   6. Return the enhanced doc as the job's return value (BullMQ-native persistence).
 *
 * No DB writes occur — the caller (or the FE polling endpoint) reads the
 * `returnvalue` directly from BullMQ/Redis.
 *
 * OpenAI 5xx errors are re-thrown so BullMQ retries via `attempts: 3, backoff: exponential`
 * configured on the producer side (subtask 1).
 */

import type { Job } from 'bullmq';
import type OpenAI from 'openai';
import type { Pool } from 'mysql2/promise';

import { promptDocSchema } from '@ai-video-editor/project-schema';
import type { EnhancePromptJobPayload, PromptDoc } from '@ai-video-editor/project-schema';

import {
  serializeWithSentinels,
  spliceSentinels,
  validateSentinelIntegrity,
} from '@/jobs/enhancePrompt.helpers.js';

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * OpenAI model used for all enhance-prompt jobs.
 * `gpt-4o-mini` offers wide capability at low latency and low cost for short
 * prompt rewrite tasks. Upgrade to `gpt-4o` if quality benchmarking requires it.
 */
const ENHANCE_MODEL = 'gpt-4o-mini' as const;

// ── System prompt ─────────────────────────────────────────────────────────────

/**
 * System prompt sent to the LLM on every enhance request.
 *
 * Key constraints (tested by `enhancePrompt.job.test.ts`):
 * - The LLM MUST preserve every `{{MEDIA_N}}` marker unchanged.
 * - The LLM MUST NOT reorder, merge, split, or drop any marker.
 * - The LLM improves phrasing, grammar, and clarity without changing meaning.
 *
 * Exported so tests can assert the exact string.
 */
export const ENHANCE_SYSTEM_PROMPT =
  `You are a professional creative writing assistant for a video production tool. ` +
  `Your task is to rewrite the user's video prompt to improve clarity, creativity, and flow. ` +
  `\n\nCRITICAL RULES — you MUST follow these exactly:\n` +
  `1. Every {{MEDIA_N}} placeholder (e.g. {{MEDIA_1}}, {{MEDIA_2}}) represents an embedded ` +
  `media reference. You MUST keep every placeholder EXACTLY as written — same spelling, same ` +
  `braces, same numbering — in the exact same order. Do NOT rename, reorder, duplicate, merge, ` +
  `or remove any placeholder.\n` +
  `2. Return ONLY the rewritten prompt text. Do not include any explanation, preamble, or metadata.\n` +
  `3. If the prompt contains no {{MEDIA_N}} placeholders, rewrite the text only.`;

// ── Error types ───────────────────────────────────────────────────────────────

/**
 * Thrown when the LLM output violates sentinel integrity — a sentinel is
 * missing, duplicated, or reordered relative to the input.
 */
export class EnhanceTokenPreservationError extends Error {
  constructor(detail: string) {
    super(`Token preservation violated: ${detail}`);
    this.name = 'EnhanceTokenPreservationError';
  }
}

/**
 * Thrown when the spliced PromptDoc fails `promptDocSchema` validation.
 * This should be rare in practice but can occur if the LLM corrupts the
 * text in a way that produces an invalid document structure.
 */
export class EnhanceSchemaError extends Error {
  constructor(detail: string) {
    super(`Schema validation failed after splice: ${detail}`);
    this.name = 'EnhanceSchemaError';
  }
}

// ── Deps type ─────────────────────────────────────────────────────────────────

/** Injected dependencies for `processEnhancePromptJob` — enables testing without real OpenAI/DB. */
export type EnhancePromptJobDeps = {
  openai: OpenAI;
  /** DB pool is injected for interface consistency with other handlers but is not used — */
  /** this handler performs no DB writes. */
  pool: Pool;
};

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * BullMQ job handler for `ai-enhance` jobs.
 *
 * The function return value becomes the job's `returnvalue` in BullMQ/Redis —
 * no explicit `job.updateProgress()` or DB write is needed.
 *
 * On any failure the error is re-thrown so BullMQ can retry according to the
 * producer-configured `attempts` and `backoff` settings.
 */
export async function processEnhancePromptJob(
  job: Job<EnhancePromptJobPayload>,
  deps: EnhancePromptJobDeps,
): Promise<PromptDoc> {
  const { promptDoc } = job.data;
  const { openai } = deps;

  // Step 1: serialize — replace media-ref blocks with {{MEDIA_N}} sentinels
  const { text: inputText, media } = serializeWithSentinels(promptDoc);

  // Step 2: call OpenAI chat completions
  const completion = await openai.chat.completions.create({
    model: ENHANCE_MODEL,
    messages: [
      { role: 'system', content: ENHANCE_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  const rawOutput = completion.choices[0]?.message?.content ?? '';

  // Step 3: validate sentinel integrity before splicing
  const integrityError = validateSentinelIntegrity(rawOutput, media.length);
  if (integrityError !== null) {
    throw new EnhanceTokenPreservationError(integrityError);
  }

  // Step 4: splice media-ref blocks back into the rewritten text
  const enhanced = spliceSentinels(rawOutput, media);

  // Step 5: validate the spliced result against the schema
  const parseResult = promptDocSchema.safeParse(enhanced);
  if (!parseResult.success) {
    throw new EnhanceSchemaError(parseResult.error.message);
  }

  // Step 6: return — BullMQ stores this as job.returnvalue automatically
  return parseResult.data;
}
