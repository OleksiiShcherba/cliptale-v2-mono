/**
 * Smoke tests for the fal.ai unified AI generation layer.
 *
 * These tests hit the REAL fal.ai queue API and cost real money.
 * They are SKIPPED BY DEFAULT unless APP_FAL_SMOKE=1 is set.
 *
 * See apps/api/src/__tests__/smoke/README.md for full instructions.
 *
 * Run:
 *   APP_FAL_SMOKE=1 APP_FAL_KEY=<real-key> \
 *     pnpm --filter @cliptale/api test \
 *     src/__tests__/smoke/fal-generation.smoke.test.ts
 */
import { describe, it, expect } from 'vitest';
import { FAL_MODELS } from '@ai-video-editor/api-contracts';

// ── Stable public test image (picsum.photos — deterministic per seed) ─────────
const TEST_IMAGE_URL = 'https://picsum.photos/seed/cliptale-smoke/512/512.jpg';

// ── Minimal fal HTTP client (submit + poll) ───────────────────────────────────
// Inlined deliberately: keeps the smoke test independent of apps/media-worker
// and avoids cross-package imports that would break tsc emit. See task notes.

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const SMOKE_POLL_INTERVAL_MS = 5_000;

async function submit(
  modelId: string,
  input: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  const url = `${FAL_QUEUE_BASE}/${modelId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `fal.ai submit error (model ${modelId}, status ${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as { request_id?: unknown };
  if (typeof data.request_id !== 'string' || data.request_id.length === 0) {
    throw new Error(
      `fal.ai submit error (model ${modelId}): response missing request_id`,
    );
  }
  return data.request_id;
}

async function poll(
  modelId: string,
  requestId: string,
  apiKey: string,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusUrl = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}/status`;
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });

    if (!statusRes.ok) {
      const body = await statusRes.text();
      throw new Error(
        `fal.ai status error (model ${modelId}, request_id ${requestId}, status ${statusRes.status}): ${body}`,
      );
    }

    const statusData = (await statusRes.json()) as {
      status?: unknown;
      output?: unknown;
    };
    const status = statusData.status;

    if (status === 'COMPLETED') {
      if (statusData.output !== undefined) {
        return statusData.output;
      }
      const resultUrl = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}`;
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!resultRes.ok) {
        const body = await resultRes.text();
        throw new Error(
          `fal.ai result error (model ${modelId}, request_id ${requestId}, status ${resultRes.status}): ${body}`,
        );
      }
      return (await resultRes.json()) as unknown;
    }

    if (status === 'FAILED') {
      const detail =
        statusData.output !== undefined
          ? `: ${JSON.stringify(statusData.output)}`
          : '';
      throw new Error(
        `fal.ai job FAILED (model ${modelId}, request_id ${requestId})${detail}`,
      );
    }

    if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      throw new Error(
        `fal.ai unexpected status (model ${modelId}, request_id ${requestId}): ${JSON.stringify(status)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, SMOKE_POLL_INTERVAL_MS));
  }

  throw new Error(
    `fal.ai job timed out after ${timeoutMs}ms (model ${modelId}, request_id ${requestId})`,
  );
}

// ── Smoke suite ───────────────────────────────────────────────────────────────

const isSmokeEnabled = process.env['APP_FAL_SMOKE'] === '1';

describe.skipIf(!isSmokeEnabled)(
  'fal.ai smoke — one model per capability',
  () => {
    const apiKey = process.env['APP_FAL_KEY'] ?? '';

    // Guard only fires when the suite is actually enabled — describe.skipIf
    // still calls the callback at collection time, so the throw must be
    // gated by the same condition to stay silent on default runs.
    if (isSmokeEnabled && (!apiKey || apiKey === 'test-fal-key')) {
      throw new Error(
        'APP_FAL_SMOKE=1 requires a real APP_FAL_KEY (not the unit-test stub "test-fal-key")',
      );
    }

    const CDN_PATTERN =
      /^https:\/\/(v3\.fal\.media|fal\.media|storage\.googleapis\.com\/falserverless)/;

    // ── 1. Text-to-image ────────────────────────────────────────────────────
    it(
      'text-to-image: fal-ai/nano-banana-2 returns a valid image URL',
      async () => {
        const model = FAL_MODELS.find((m) => m.id === 'fal-ai/nano-banana-2');
        if (!model) throw new Error('fal-ai/nano-banana-2 not found in FAL_MODELS catalog');

        const requestId = await submit(
          model.id,
          {
            prompt: 'a small red apple on a white background',
            num_images: 1,
            resolution: '0.5K',
            output_format: 'png',
          },
          apiKey,
        );

        const output = (await poll(model.id, requestId, apiKey, 3 * 60 * 1000)) as {
          images?: Array<{ url?: unknown }>;
        };

        const url = output?.images?.[0]?.url;
        if (typeof url !== 'string') {
          throw new Error(
            `text-to-image: expected output.images[0].url to be a string, got: ${JSON.stringify(output)}`,
          );
        }
        expect(url).toMatch(CDN_PATTERN);
        expect(url).toMatch(/\.(png|jpeg|webp)$/i);
      },
      3 * 60 * 1000,
    );

    // ── 2. Image edit ───────────────────────────────────────────────────────
    it(
      'image-edit: fal-ai/nano-banana-2/edit returns a valid image URL',
      async () => {
        const model = FAL_MODELS.find((m) => m.id === 'fal-ai/nano-banana-2/edit');
        if (!model) throw new Error('fal-ai/nano-banana-2/edit not found in FAL_MODELS catalog');

        const requestId = await submit(
          model.id,
          {
            prompt: 'add a blue sky background',
            image_urls: [TEST_IMAGE_URL],
            num_images: 1,
            resolution: '0.5K',
            output_format: 'png',
          },
          apiKey,
        );

        const output = (await poll(model.id, requestId, apiKey, 3 * 60 * 1000)) as {
          images?: Array<{ url?: unknown }>;
        };

        const url = output?.images?.[0]?.url;
        if (typeof url !== 'string') {
          throw new Error(
            `image-edit: expected output.images[0].url to be a string, got: ${JSON.stringify(output)}`,
          );
        }
        expect(url).toMatch(CDN_PATTERN);
        expect(url).toMatch(/\.(png|jpeg|webp)$/i);
      },
      3 * 60 * 1000,
    );

    // ── 3. Text-to-video ────────────────────────────────────────────────────
    it(
      'text-to-video: fal-ai/kling-video/v2.5-turbo/pro/text-to-video returns a valid video URL',
      async () => {
        const model = FAL_MODELS.find(
          (m) => m.id === 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        );
        if (!model) {
          throw new Error(
            'fal-ai/kling-video/v2.5-turbo/pro/text-to-video not found in FAL_MODELS catalog',
          );
        }

        const requestId = await submit(
          model.id,
          {
            prompt: 'a butterfly landing on a flower, cinematic',
            duration: '5',
            aspect_ratio: '16:9',
          },
          apiKey,
        );

        const output = (await poll(model.id, requestId, apiKey, 10 * 60 * 1000)) as {
          video?: { url?: unknown };
        };

        const url = output?.video?.url;
        if (typeof url !== 'string') {
          throw new Error(
            `text-to-video: expected output.video.url to be a string, got: ${JSON.stringify(output)}`,
          );
        }
        expect(url).toMatch(CDN_PATTERN);
        expect(url).toMatch(/\.mp4$/i);
      },
      10 * 60 * 1000,
    );

    // ── 4. Image-to-video ───────────────────────────────────────────────────
    it(
      'image-to-video: fal-ai/pixverse/v6/image-to-video returns a valid video URL',
      async () => {
        const model = FAL_MODELS.find(
          (m) => m.id === 'fal-ai/pixverse/v6/image-to-video',
        );
        if (!model) {
          throw new Error('fal-ai/pixverse/v6/image-to-video not found in FAL_MODELS catalog');
        }

        const requestId = await submit(
          model.id,
          {
            image_url: TEST_IMAGE_URL,
            prompt: 'the scene gently zooms in',
            duration: 5,
            resolution: '360p',
          },
          apiKey,
        );

        const output = (await poll(model.id, requestId, apiKey, 8 * 60 * 1000)) as {
          video?: { url?: unknown };
        };

        const url = output?.video?.url;
        if (typeof url !== 'string') {
          throw new Error(
            `image-to-video: expected output.video.url to be a string, got: ${JSON.stringify(output)}`,
          );
        }
        expect(url).toMatch(CDN_PATTERN);
        expect(url).toMatch(/\.mp4$/i);
      },
      8 * 60 * 1000,
    );
  },
);
