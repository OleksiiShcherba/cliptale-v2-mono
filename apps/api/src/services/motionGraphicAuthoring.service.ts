/**
 * motionGraphicAuthoring.service.ts — T9 (Anthropic streaming proxy with SSE framing)
 *
 * Generation/refinement streams Claude's authored Remotion component into the chat in
 * real time, behind the pre-stream gates. Derives from ADR-0002 (Anthropic Claude for
 * code authoring), ADR-0003 (SSE frame protocol), ADR-0007 (prompt guardrail) and
 * sad.md §6 flows 1 (generate) & 3 (refine).
 *
 * The service is split into PURE pieces (gate checks, system-prompt assembly, frame
 * serialization) and the streaming I/O, so it is unit-testable without a live network:
 * the streaming function accepts an injected `streamFactory` returning an async-iterable
 * of Anthropic raw stream events, which the tests fake.
 *
 * Order of operations (sad.md §6 — gates run BEFORE the stream opens; a gate failure
 * throws a `GateError` surfaced by the caller (T11) as a JSON 4xx, NOT an SSE error frame):
 *   generate: length(AC-05) → cost re-validation(AC-11, T7) → guardrail(T8) → open stream
 *   refine:                    cost re-validation(AC-11, T7) → guardrail(T8) → open stream
 * Then Claude tokens relay as ordered `token` frames terminated by a `done` frame; a
 * mid-stream upstream/transport failure emits an `error` frame (ADR-0003).
 *
 * No persistence here — the browser persists the verdict via T10's create/turns endpoints.
 * The HTTP wiring (open `text/event-stream`, map thrown gates → 422) is T11.
 */

import type Anthropic from '@anthropic-ai/sdk';

import { anthropic } from '../lib/anthropic.js';
import { config } from '../config.js';
import { GateError } from '../lib/errors.js';
import { revalidateEstimate, computeGenerationEstimate } from './motionGraphic.cost.service.js';
import { assertPromptAllowed } from './motionGraphicGuardrail.service.js';
import { AUTHORING_SYSTEM_PROMPT } from './motionGraphicAuthoring.prompt.js';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum description length for a meaningful generation prompt (AC-05).
 * Mirrors contracts/openapi.yaml `details.minLength: 12` for
 * `motion_graphic.description_too_short`.
 */
export const DESCRIPTION_MIN_LENGTH = 12;

/** Stable machine code for the AC-05 length gate (422 via GateError). */
export const MOTION_GRAPHIC_DESCRIPTION_TOO_SHORT_CODE = 'motion_graphic.description_too_short';

/** Max tokens for the authored component (streaming, ADR-0002 / Opus authoring tier). */
const AUTHORING_MAX_TOKENS = 16_000;

// ── Frame protocol (ADR-0003) — pure serialization ──────────────────────────

/** An SSE frame in the ADR-0003 generation protocol. */
export type AuthoringFrame =
  | { type: 'token'; data: string }
  | { type: 'done'; finishReason: string }
  | { type: 'error'; message: string };

/**
 * Serialize an {@link AuthoringFrame} to its exact SSE wire string (ADR-0003):
 *   token: `event: token\ndata: <code chunk>\n\n`
 *   done:  `event: done\ndata: {"finishReason":"stop"}\n\n`
 *   error: `event: error\ndata: {"message":"..."}\n\n`
 *
 * `token` data is the raw code chunk (relayed verbatim, appended in order by the
 * client to reconstruct the component). `done`/`error` data are JSON objects.
 * Each frame ends with a blank line (`\n\n`) — the SSE frame terminator.
 */
export function serializeFrame(frame: AuthoringFrame): string {
  switch (frame.type) {
    case 'token':
      return `event: token\ndata: ${frame.data}\n\n`;
    case 'done':
      return `event: done\ndata: ${JSON.stringify({ finishReason: frame.finishReason })}\n\n`;
    case 'error':
      return `event: error\ndata: ${JSON.stringify({ message: frame.message })}\n\n`;
  }
}

// ── AC-05: description length gate (pure) ────────────────────────────────────

/**
 * AC-05 — refuse a generation whose description is empty or shorter than the
 * meaningful minimum, BEFORE any LLM call. Throws GateError
 * (`motion_graphic.description_too_short`, 422) carrying `{ minLength }`.
 *
 * Length is measured on the trimmed prompt (leading/trailing whitespace doesn't
 * make a prompt meaningful). Applies to GENERATE only — a refine instruction can
 * legitimately be short ("bigger", "use blue").
 */
export function assertDescriptionLength(prompt: string): void {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
  if (trimmed.length < DESCRIPTION_MIN_LENGTH) {
    throw new GateError(
      'Add a longer, more detailed description so the AI has enough to work with.',
      MOTION_GRAPHIC_DESCRIPTION_TOO_SHORT_CODE,
      { minLength: DESCRIPTION_MIN_LENGTH },
    );
  }
}

// ── Prompt / message assembly (pure) ─────────────────────────────────────────

/** A prior chat turn supplied for refine (US-04 / sad.md §6 flow 3). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Build the Anthropic `system` blocks with prompt-caching on the fixed prefix
 * (ADR-0002): the system prompt + Remotion runtime contract is a single stable
 * text block marked `cache_control: { type: 'ephemeral' }`, so the large fixed
 * prefix is amortized across the iterate loop (serves the TTFT ≤ 3 s NFR).
 */
export function buildSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: AUTHORING_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * Assemble the per-request `messages` (volatile content AFTER the cached prefix).
 *  - generate: a single `user` turn = the description, with the duration as context.
 *  - refine:   the prior chat `history` (re-runnable turns) followed by the new
 *              instruction as the final `user` turn.
 */
export function buildMessages(params: {
  mode: 'generate' | 'refine';
  prompt: string;
  durationSeconds: number;
  history?: ChatTurn[];
}): Anthropic.MessageParam[] {
  const { mode, prompt, durationSeconds, history = [] } = params;
  const instruction =
    `Animation duration: ${durationSeconds} seconds.\n\n` +
    (mode === 'generate'
      ? `Author a Motion Graphic for this description:\n${prompt}`
      : `Apply this refinement to the current component:\n${prompt}`);

  const prior: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  return [...prior, { role: 'user', content: instruction }];
}

// ── Streaming I/O ────────────────────────────────────────────────────────────

/**
 * A factory that opens the Anthropic stream and returns an async-iterable of raw
 * stream events. Injected so tests can supply a fake iterable (no live network).
 * The default factory calls the singleton client's `messages.create({stream:true})`.
 */
export type AuthoringStreamFactory = (req: {
  model: string;
  max_tokens: number;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
}) => AsyncIterable<unknown>;

/** Default factory — opens a real Anthropic streaming response (ADR-0002/0003). */
export const defaultStreamFactory: AuthoringStreamFactory = (req) =>
  anthropic.messages.create({
    model: req.model,
    max_tokens: req.max_tokens,
    system: req.system,
    messages: req.messages,
    stream: true,
  }) as unknown as AsyncIterable<unknown>;

/**
 * Narrow a raw Anthropic stream event to its emitted text token, if any.
 * Tokens arrive as `content_block_delta` events carrying a `text_delta`.
 */
function extractToken(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as { type?: unknown; delta?: { type?: unknown; text?: unknown } };
  if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
    return typeof e.delta.text === 'string' ? e.delta.text : null;
  }
  return null;
}

export interface RunAuthoringStreamParams {
  mode: 'generate' | 'refine';
  /** Generate: the Creator's description. Refine: the new instruction. */
  prompt: string;
  durationSeconds: number;
  /** The estimate the Creator confirmed in the cost gate; re-validated server-side (AC-11). */
  clientEstimate: string | null | undefined;
  /** Prior chat turns for refine (ignored for generate). */
  history?: ChatTurn[];
  /** Called with each ADR-0003 SSE-wire frame string (transport-agnostic; T11 pipes to res). */
  onFrame: (wire: string) => void;
  /** Injectable stream factory (defaults to the real Anthropic client). */
  streamFactory?: AuthoringStreamFactory;
}

/**
 * Run the authoring stream: pre-stream gates (throw on failure, BEFORE opening the
 * stream), then relay Claude tokens as ADR-0003 SSE frames via `onFrame`.
 *
 * Gate order (sad.md §6):
 *   1. length      — generate only (AC-05) → GateError(`description_too_short`, 422)
 *   2. cost        — T7 revalidateEstimate (AC-11) → GateError(`estimate_revalidation_failed`, 422)
 *   3. guardrail   — T8 assertPromptAllowed (§6 NFR) → GateError(`prompt_rejected`, 422)
 * Any throw happens before `streamFactory` is invoked, so the caller (T11) returns a
 * JSON 4xx and no SSE frame is ever written.
 *
 * On pass: `token` frames in order, then a `done` frame. A mid-stream failure emits an
 * `error` frame (the stream is already open, so the failure cannot be a JSON 4xx).
 */
export async function runAuthoringStream(params: RunAuthoringStreamParams): Promise<void> {
  const {
    mode,
    prompt,
    durationSeconds,
    clientEstimate,
    history,
    onFrame,
    streamFactory = defaultStreamFactory,
  } = params;

  // ── Pre-stream gates (throw BEFORE the stream opens) ──
  // 1. Length (AC-05) — generate only.
  if (mode === 'generate') {
    assertDescriptionLength(prompt);
  }
  // 2. Cost re-validation (AC-11) — delegate to T7. Server estimate is the source of truth.
  const serverEstimate = await computeGenerationEstimate({ durationSeconds });
  revalidateEstimate({ serverEstimate, clientEstimate });
  // 3. Prompt guardrail (§6 NFR / ADR-0007) — delegate to T8.
  assertPromptAllowed(prompt);

  // ── Open the stream (gates passed) and relay frames ──
  const system = buildSystemBlocks();
  const messages = buildMessages({ mode, prompt, durationSeconds, history });

  let stream: AsyncIterable<unknown>;
  try {
    stream = streamFactory({
      model: config.anthropic.model,
      max_tokens: AUTHORING_MAX_TOKENS,
      system,
      messages,
    });
  } catch (err) {
    // Failure to even open the stream → error frame (the response is already SSE per T11).
    onFrame(serializeFrame({ type: 'error', message: errorMessage(err) }));
    return;
  }

  try {
    for await (const event of stream) {
      const token = extractToken(event);
      if (token !== null && token.length > 0) {
        onFrame(serializeFrame({ type: 'token', data: token }));
      }
    }
    onFrame(serializeFrame({ type: 'done', finishReason: 'stop' }));
  } catch (err) {
    // Mid-stream upstream/transport failure — emit an error frame (ADR-0003); no done frame.
    onFrame(serializeFrame({ type: 'error', message: errorMessage(err) }));
  }
}

/** Extract a client-safe message string from an unknown thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'The generation stream failed unexpectedly.';
}
