/**
 * fal.ai Queue API HTTP client — thin wrapper around the global `fetch`.
 *
 * This module is the ONLY place in the codebase that knows how to talk to
 * fal.ai's HTTP queue API. It is a pure function module with no side effects
 * on import: the API key is passed as a parameter (never read from
 * `process.env` or imported from `@/config`). This keeps it trivial to unit
 * test with a stubbed global `fetch`.
 *
 * As of Ticket 3 (EPIC 9) this file has zero callers. Tickets 5 (API service
 * `/ai/models` health endpoint) and 7 (worker `ai-generate` job handler) will
 * consume `submitFalJob` / `pollFalJob` once they land.
 *
 * ── fal.ai Queue API (authoritative URL patterns) ─────────────────────────
 *
 *   Submit:   POST  https://queue.fal.run/{modelId}
 *             headers: { Authorization: "Key <apiKey>", Content-Type: "application/json" }
 *             body:    JSON model input
 *             returns: { request_id, status_url, response_url, cancel_url, queue_position }
 *
 *   Status:   GET   https://queue.fal.run/{modelId}/requests/{requestId}/status
 *             headers: { Authorization: "Key <apiKey>" }
 *             returns: { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED", ... }
 *
 *   Result:   GET   https://queue.fal.run/{modelId}/requests/{requestId}
 *             headers: { Authorization: "Key <apiKey>" }
 *             returns: model-specific output JSON (e.g. `{ images: [...] }`)
 *
 * ── Status enum (per fal.ai docs, 2026-04-09) ─────────────────────────────
 *
 *   IN_QUEUE      — request received, waiting for an available runner
 *   IN_PROGRESS   — a runner is executing the endpoint handler
 *   COMPLETED     — result is stored and available at the result URL
 *   FAILED        — NOT officially documented as a queue status. fal.ai surfaces
 *                   terminal failures as non-2xx HTTP responses on the status or
 *                   result endpoint. `FAILED` is retained here as a defensive
 *                   branch in case the upstream ever returns it.
 *
 * ── Example ───────────────────────────────────────────────────────────────
 *
 *   ```ts
 *   import { submitFalJob, pollFalJob } from '@/lib/fal-client.js';
 *
 *   const { requestId } = await submitFalJob({
 *     modelId: 'fal-ai/nano-banana-2',
 *     input: { prompt: 'a sunset over mountains' },
 *     apiKey: config.fal.key,
 *   });
 *
 *   const output = await pollFalJob({
 *     modelId: 'fal-ai/nano-banana-2',
 *     requestId,
 *     apiKey: config.fal.key,
 *   });
 *   ```
 */

const FAL_QUEUE_BASE_URL = 'https://queue.fal.run';

const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_POLL_INTERVAL_MS = 3_000; // 3 seconds

export type FalSubmitParams = {
  modelId: string;
  input: Record<string, unknown>;
  apiKey: string;
};

export type FalSubmitResult = {
  requestId: string;
  /** Authoritative status-poll URL returned by fal.ai on submit — use this instead of constructing the URL manually. */
  statusUrl: string;
  /** Authoritative result URL returned by fal.ai on submit — use this instead of constructing the URL manually. */
  responseUrl: string;
};

export type FalStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export type FalStatusResult = {
  status: FalStatus;
  output?: unknown;
};

export type FalStatusParams = {
  modelId: string;
  requestId: string;
  apiKey: string;
  /** Authoritative status-poll URL from the submit response — used instead of constructing the URL manually. */
  statusUrl: string;
  /** Authoritative result URL from the submit response — used to fetch the output on COMPLETED. */
  responseUrl: string;
};

export type FalPollOptions = {
  /** Maximum total time to poll before throwing a timeout error. Default: 10 minutes. */
  timeoutMs?: number;
  /** Delay between status checks. Default: 3 seconds. */
  intervalMs?: number;
};

export type FalPollParams = {
  modelId: string;
  requestId: string;
  apiKey: string;
  statusUrl: string;
  responseUrl: string;
  options?: FalPollOptions;
};

/**
 * Submits a new job to the fal.ai queue for the given model.
 * Returns the fal-assigned `requestId` which is used for polling.
 */
export async function submitFalJob(params: FalSubmitParams): Promise<FalSubmitResult> {
  const { modelId, input, apiKey } = params;
  const url = `${FAL_QUEUE_BASE_URL}/${modelId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await formatFalError(response));
  }

  const body = (await response.json()) as {
    request_id?: unknown;
    status_url?: unknown;
    response_url?: unknown;
  };
  const requestId = body.request_id;
  const statusUrl = body.status_url;
  const responseUrl = body.response_url;

  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new Error(
      `fal.ai error (status ${response.status}, request_id unknown): submit response missing request_id`,
    );
  }

  if (typeof statusUrl !== 'string' || statusUrl.length === 0) {
    throw new Error(
      `fal.ai error (status ${response.status}, request_id ${requestId}): submit response missing status_url`,
    );
  }

  if (typeof responseUrl !== 'string' || responseUrl.length === 0) {
    throw new Error(
      `fal.ai error (status ${response.status}, request_id ${requestId}): submit response missing response_url`,
    );
  }

  return { requestId, statusUrl, responseUrl };
}

/**
 * Fetches the current status of a queued fal.ai job. When the status is
 * `COMPLETED`, this function ALSO performs a follow-up `GET` to the result
 * URL and returns the final output payload on the `output` field, so callers
 * only need one helper to observe terminal state.
 */
export async function getFalJobStatus(params: FalStatusParams): Promise<FalStatusResult> {
  const { requestId, apiKey } = params;

  const statusResponse = await fetch(params.statusUrl, {
    method: 'GET',
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  });

  if (!statusResponse.ok) {
    throw new Error(await formatFalError(statusResponse, requestId));
  }

  const statusBody = (await statusResponse.json()) as {
    status?: unknown;
    output?: unknown;
  };

  const status = statusBody.status;
  if (!isFalStatus(status)) {
    throw new Error(
      `fal.ai error (status ${statusResponse.status}, request_id ${requestId}): unexpected status value ${JSON.stringify(status)}`,
    );
  }

  // If the status endpoint already carries an `output` field (e.g. in tests or
  // a future API change), pass it through directly.
  if (statusBody.output !== undefined) {
    return { status, output: statusBody.output };
  }

  // When COMPLETED, follow up with the result endpoint to fetch the payload.
  // Use the authoritative response_url from the submit step — constructing it
  // manually from modelId + requestId returns 405 for some fal.ai models.
  if (status === 'COMPLETED') {
    const resultResponse = await fetch(params.responseUrl, {
      method: 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });

    if (!resultResponse.ok) {
      throw new Error(await formatFalError(resultResponse, requestId));
    }

    const output = (await resultResponse.json()) as unknown;
    return { status, output };
  }

  return { status };
}

/**
 * Polls a fal.ai job until it reaches a terminal state.
 *
 * Resolves with the final `output` payload on `COMPLETED`.
 * Throws on `FAILED`, on upstream non-2xx, or on timeout.
 */
export async function pollFalJob(params: FalPollParams): Promise<unknown> {
  const { modelId, requestId, apiKey, statusUrl, responseUrl, options } = params;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getFalJobStatus({ modelId, requestId, apiKey, statusUrl, responseUrl });

    if (result.status === 'COMPLETED') {
      return result.output;
    }

    if (result.status === 'FAILED') {
      const detail =
        result.output !== undefined ? `: ${JSON.stringify(result.output)}` : '';
      throw new Error(
        `fal.ai job ${requestId} reported status FAILED${detail}`,
      );
    }

    await sleep(intervalMs);
  }

  throw new Error(`fal.ai job ${requestId} timed out after ${timeoutMs}ms`);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function isFalStatus(value: unknown): value is FalStatus {
  return (
    value === 'IN_QUEUE' ||
    value === 'IN_PROGRESS' ||
    value === 'COMPLETED' ||
    value === 'FAILED'
  );
}

/**
 * Builds a uniform error message for non-2xx fal.ai responses. The substring
 * `request_id` always appears, falling back to `unknown` when upstream did
 * not include one. The verbatim upstream body is appended so callers can see
 * what fal.ai actually said.
 */
async function formatFalError(
  response: Response,
  fallbackRequestId?: string,
): Promise<string> {
  const rawBody = await response.text();

  let parsedRequestId: string | undefined;
  let bodyForMessage = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as { request_id?: unknown };
    if (typeof parsed.request_id === 'string') {
      parsedRequestId = parsed.request_id;
    }
    bodyForMessage = rawBody;
  } catch {
    // Not JSON — leave rawBody as-is for the message.
  }

  const requestId = parsedRequestId ?? fallbackRequestId ?? 'unknown';
  return `fal.ai error (status ${response.status}, request_id ${requestId}): ${bodyForMessage}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
