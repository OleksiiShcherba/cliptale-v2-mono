import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseFalOutput } from '@/jobs/ai-generate.output.js';
import { downloadArtifact } from '@/jobs/ai-generate.utils.js';
import {
  createTestFalClient,
  createTestOpenAIImageClient,
} from '@/lib/test-generation/testClients.js';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets');
const IMAGE_BYTES = readFileSync(join(ASSETS_DIR, 'test-image.png')).length;
const VIDEO_BYTES = readFileSync(join(ASSETS_DIR, 'test-video.mp4')).length;

describe('test-generation stub clients', () => {
  describe('createTestOpenAIImageClient', () => {
    it('returns a base64 PNG from images.generate matching the bundled asset', async () => {
      const client = createTestOpenAIImageClient();
      const resp = await client.images.generate({ model: 'x', prompt: 'p' });
      const b64 = resp.data?.[0]?.b64_json;
      expect(b64).toBeTruthy();
      expect(Buffer.from(b64!, 'base64').length).toBe(IMAGE_BYTES);
    });

    it('images.edit returns the same base64 PNG', async () => {
      const client = createTestOpenAIImageClient();
      const resp = await client.images.edit({ model: 'x', image: [] as never, prompt: 'p' });
      expect(Buffer.from(resp.data![0]!.b64_json!, 'base64').length).toBe(IMAGE_BYTES);
    });
  });

  describe('createTestFalClient', () => {
    it('submitFalJob returns a stub request without any network call', async () => {
      const fal = createTestFalClient();
      const result = await fal.submitFalJob({ modelId: 'm', input: {}, apiKey: '' });
      expect(result.requestId).toBe('test-mode-request');
      expect(result.statusUrl).toMatch(/^data:/);
      expect(result.responseUrl).toMatch(/^data:/);
    });

    it('getFalJobStatus resolves COMPLETED with a video output that downloads to the bundled mp4', async () => {
      const fal = createTestFalClient();
      const status = await fal.getFalJobStatus({
        modelId: 'm',
        requestId: 'r',
        apiKey: '',
        statusUrl: '',
        responseUrl: '',
      });
      expect(status.status).toBe('COMPLETED');

      const parsed = parseFalOutput('image_to_video', status.output);
      expect(parsed.extension).toBe('mp4');
      expect(parsed.contentType).toBe('video/mp4');
      const buf = await downloadArtifact(parsed.remoteUrl);
      expect(buf.length).toBe(VIDEO_BYTES);
    });

    it('the same response also resolves as an image output (any fal capability)', async () => {
      const fal = createTestFalClient();
      const status = await fal.getFalJobStatus({
        modelId: 'm',
        requestId: 'r',
        apiKey: '',
        statusUrl: '',
        responseUrl: '',
      });
      const parsed = parseFalOutput('text_to_image', status.output);
      expect(parsed.contentType).toBe('image/png');
      const buf = await downloadArtifact(parsed.remoteUrl);
      expect(buf.length).toBe(IMAGE_BYTES);
    });
  });
});
