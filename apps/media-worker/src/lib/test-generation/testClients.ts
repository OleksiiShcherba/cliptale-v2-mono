/**
 * Test-mode generation clients (AI_GENERATION_STATE=test).
 *
 * When the worker boots with AI_GENERATION_STATE=test, the storyboard image
 * (OpenAI) and the fal.ai video/image jobs are wired with these stub clients
 * instead of the real provider clients. They make NO network call and require
 * NO provider API key — they return bundled local test assets so the whole
 * storyboard generation pipeline can be exercised end-to-end (DB writes, S3
 * upload, realtime status, phase advance) without spending money on real
 * image/video generation.
 *
 * The stubs are structurally compatible with the injected `deps`:
 *  - the OpenAI stub implements only `images.edit` / `images.generate`
 *    (the sole methods `processStoryboardOpenAIImageJob` calls), returning a
 *    base64 PNG exactly like the real Images API;
 *  - the fal stub implements `submitFalJob` / `getFalJobStatus`, returning a
 *    COMPLETED status whose output carries BOTH an image and a video `data:`
 *    URL, so `parseFalOutput` resolves it for ANY fal capability (image or
 *    video). `downloadArtifact` fetches the `data:` URL into a Buffer.
 *
 * Assets are read lazily (only when a stub is actually invoked) so importing
 * this module has no filesystem side effect in real mode.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type OpenAI from 'openai';

import type {
  FalStatusParams,
  FalStatusResult,
  FalSubmitParams,
  FalSubmitResult,
} from '@/lib/fal-client.js';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets');

const TEST_IMAGE_DIMENSIONS = { width: 1024, height: 1024 } as const;
const TEST_VIDEO_DIMENSIONS = { width: 1280, height: 720, duration: 2 } as const;

let cachedImageBase64: string | undefined;
let cachedVideoBase64: string | undefined;

function loadImageBase64(): string {
  cachedImageBase64 ??= readFileSync(join(ASSETS_DIR, 'test-image.png')).toString('base64');
  return cachedImageBase64;
}

function loadVideoBase64(): string {
  cachedVideoBase64 ??= readFileSync(join(ASSETS_DIR, 'test-video.mp4')).toString('base64');
  return cachedVideoBase64;
}

/**
 * Stub OpenAI client for storyboard image jobs. Only `images.edit` and
 * `images.generate` are implemented — the cast to `OpenAI` is safe because
 * `processStoryboardOpenAIImageJob` touches no other member.
 */
export function createTestOpenAIImageClient(): OpenAI {
  const respond = async () => ({ data: [{ b64_json: loadImageBase64() }] });
  const stub = {
    images: {
      edit: respond,
      generate: respond,
    },
  };
  return stub as unknown as OpenAI;
}

/** Stub fal.ai client for the ai-generate job (video + image capabilities). */
export function createTestFalClient(): {
  submitFalJob: (params: FalSubmitParams) => Promise<FalSubmitResult>;
  getFalJobStatus: (params: FalStatusParams) => Promise<FalStatusResult>;
} {
  return {
    submitFalJob: async (): Promise<FalSubmitResult> => ({
      requestId: 'test-mode-request',
      statusUrl: 'data:,test-mode-status',
      responseUrl: 'data:,test-mode-response',
    }),
    getFalJobStatus: async (): Promise<FalStatusResult> => ({
      status: 'COMPLETED',
      output: {
        // Carry both shapes so parseFalOutput resolves for image AND video
        // capabilities off the same stubbed response.
        images: [
          {
            url: `data:image/png;base64,${loadImageBase64()}`,
            ...TEST_IMAGE_DIMENSIONS,
          },
        ],
        video: {
          url: `data:video/mp4;base64,${loadVideoBase64()}`,
          ...TEST_VIDEO_DIMENSIONS,
        },
      },
    }),
  };
}
