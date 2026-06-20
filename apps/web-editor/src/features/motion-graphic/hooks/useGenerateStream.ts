/**
 * useGenerateStream — the SSE client for `POST /motion-graphics/generate` (T16 / Flow 1).
 *
 * The generate stream is NOT wrapped in api.ts: `apiClient` returns parsed JSON, but
 * this endpoint returns either
 *   - a pre-stream JSON 4xx (length AC-05 / cost AC-11 / guardrail) BEFORE the stream
 *     opens, OR
 *   - a `text/event-stream` of `event:`/`data:` frames (ADR-0003) on pass.
 *
 * So we POST with a raw `fetch` (same auth/base-url idiom as api-client and the
 * generate-ai-flow generate call), then DISTINGUISH the two by status + content-type
 * BEFORE touching the body:
 *   - !res.ok  → parse the JSON error envelope and throw a typed `GenerateStreamError`
 *     carrying `code` (so the view can surface AC-05's `description_too_short` inline
 *     and tell cost/guardrail 422s apart). The stream is never read.
 *   - res.ok + text/event-stream → read `res.body` with a reader + TextDecoder, parse
 *     `event: <name>\ndata: <payload>` frames, append `token` data in arrival order,
 *     stop on `done`, and reject on a mid-stream `error` frame.
 *
 * `runGenerate` resolves with the fully assembled component source (the concatenated
 * token payloads). The caller (the authoring view) then runs transpile + determinism
 * (T15 evaluateGraphic) on it and persists the verdict via `POST /motion-graphics`.
 */

import { useCallback } from 'react';

import { getAuthToken } from '@/lib/api-client';
import { config } from '@/lib/config';

import type { GenerateRequest, RefineRequest } from '../types';

/**
 * A pre-stream gate rejection (JSON 4xx). `code` is the machine-readable reason from
 * the error envelope — e.g. `motion_graphic.description_too_short` (AC-05),
 * `motion_graphic.estimate_revalidation_failed` (AC-11),
 * `motion_graphic.prompt_rejected` (guardrail). `error` (the human message) is the
 * thrown Error's message, shown inline.
 */
export class GenerateStreamError extends Error {
  code: string | null;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    opts: { code?: string | null; status: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'GenerateStreamError';
    this.code = opts.code ?? null;
    this.status = opts.status;
    this.details = opts.details;
  }
}

/**
 * Strip a wrapping markdown code fence from assembled model output.
 *
 * Despite the system prompt forbidding fences, models intermittently wrap the
 * component in ```` ```tsx … ``` ````. The fence makes the source un-parseable
 * (the determinism scan + transpile both reject it) AND would be persisted as the
 * graphic's code, so we normalize it ONCE here — at the single point the full
 * source first exists — so clean code flows to evaluate, persistence, and the
 * player alike. A non-fenced response is returned unchanged (only trimmed).
 */
export function stripCodeFences(source: string): string {
  const trimmed = source.trim();
  // Opening fence: ``` optionally followed by a language tag (tsx/ts/jsx/js), to EOL.
  const openFence = /^```[^\n`]*\r?\n/;
  if (!openFence.test(trimmed)) return trimmed;
  return trimmed
    .replace(openFence, '')
    // Closing fence on its own (optionally trailing) line.
    .replace(/\r?\n?```[ \t]*\r?\n?$/, '')
    .trim();
}

/** Parse one SSE frame block (`event: x\ndata: y\n...`) into { event, data }. */
function parseFrame(block: string): { event: string; data: string } {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      // Per the SSE grammar a single leading space after the colon is stripped.
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }
  return { event, data: dataLines.join('\n') };
}

/**
 * Consume a `text/event-stream` body, assembling `token` payloads in order. Resolves
 * with the concatenated source on the `done` frame; rejects on an `error` frame.
 */
async function consumeStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assembled = '';
  let done = false;

  const handleBlock = (block: string): void => {
    if (block.trim() === '') return;
    const frame = parseFrame(block);
    if (frame.event === 'token') {
      assembled += frame.data;
    } else if (frame.event === 'done') {
      done = true;
    } else if (frame.event === 'error') {
      let message = 'Generation failed before it could finish.';
      try {
        const parsed = JSON.parse(frame.data) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        if (frame.data) message = frame.data;
      }
      throw new GenerateStreamError(message, { status: 200, code: 'motion_graphic.stream_error' });
    }
  };

  for (;;) {
    const { value, done: streamDone } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line (\n\n).
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleBlock(block);
      if (done) return assembled;
    }

    if (streamDone) {
      // Flush any trailing block without a terminating blank line.
      if (buffer.trim() !== '') handleBlock(buffer);
      return assembled;
    }
  }
}

/**
 * POST `body` to an authoring SSE endpoint and resolve with the assembled source.
 *
 * Shared by both `runGenerate` (Flow 1) and `runRefine` (Flow 3): the frame protocol
 * is identical (ADR-0003 token/done/error), only the URL + body differ — generate
 * carries the length gate, refine does NOT (it operates on an existing graphic).
 * Rejects with a `GenerateStreamError` on a pre-stream JSON 4xx (cost AC-11 / guardrail,
 * plus generate-only length AC-05) or a mid-stream error frame.
 */
async function openAuthoringStream(path: string, body: unknown): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  // Distinguish the pre-stream JSON 4xx from the opened stream BEFORE reading the
  // body. A gate failure (length AC-05 / cost AC-11 / guardrail) is a normal JSON
  // 4xx; only a clean pass opens text/event-stream.
  if (!res.ok) {
    let parsed: { error?: string; code?: string | null; details?: Record<string, unknown> } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // body may not be JSON
    }
    throw new GenerateStreamError(parsed.error ?? `HTTP ${res.status}`, {
      code: parsed.code ?? null,
      status: res.status,
      details: parsed.details,
    });
  }

  if (!res.body) {
    throw new GenerateStreamError('The generation stream could not be opened.', {
      status: res.status,
    });
  }

  return stripCodeFences(await consumeStream(res.body));
}

export interface UseGenerateStreamResult {
  /**
   * Open the generate stream and resolve with the assembled component source.
   * Rejects with a `GenerateStreamError` on a pre-stream gate (AC-05/AC-11/guardrail)
   * or a mid-stream error frame.
   */
  runGenerate: (req: GenerateRequest) => Promise<string>;
  /**
   * Open the refine stream for an existing graphic (Flow 3) and resolve with the
   * assembled component source. Same frame protocol as `runGenerate`; the URL is
   * `POST /motion-graphics/:id/refine` and refine has NO length gate.
   */
  runRefine: (id: string, req: RefineRequest) => Promise<string>;
}

export function useGenerateStream(): UseGenerateStreamResult {
  const runGenerate = useCallback(
    (req: GenerateRequest): Promise<string> =>
      openAuthoringStream('/motion-graphics/generate', req),
    [],
  );

  const runRefine = useCallback(
    (id: string, req: RefineRequest): Promise<string> =>
      openAuthoringStream(`/motion-graphics/${id}/refine`, req),
    [],
  );

  return { runGenerate, runRefine };
}
