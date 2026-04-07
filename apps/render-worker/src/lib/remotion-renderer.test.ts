/**
 * Unit tests for remotion-renderer.ts — renderComposition.
 *
 * Validates that:
 * - browserExecutable is forwarded to selectComposition and renderMedia when
 *   config.chromiumExecutablePath is set (Docker path).
 * - browserExecutable is null when config.chromiumExecutablePath is undefined
 *   (local development / auto-detect).
 * - The correct compositionId, codec, and outputLocation are passed through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockBundle,
  mockSelectComposition,
  mockRenderMedia,
  mockConfig,
} = vi.hoisted(() => ({
  mockBundle: vi.fn(),
  mockSelectComposition: vi.fn(),
  mockRenderMedia: vi.fn(),
  mockConfig: {
    chromiumExecutablePath: undefined as string | undefined,
    s3: { bucket: 'test' },
  },
}));

vi.mock('@remotion/bundler', () => ({
  bundle: mockBundle,
}));

vi.mock('@remotion/renderer', () => ({
  selectComposition: mockSelectComposition,
  renderMedia: mockRenderMedia,
}));

vi.mock('@/config.js', () => ({
  get config() {
    return mockConfig;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

import type { ProjectDoc, RenderPreset } from '@ai-video-editor/project-schema';

import { renderComposition } from './remotion-renderer.js';

const BUNDLE_URL = 'http://localhost:3000';

const fakeComposition = {
  id: 'VideoComposition',
  durationInFrames: 300,
  fps: 30,
  width: 1920,
  height: 1080,
};

const fakeDoc = {
  title: 'Test',
  tracks: [],
  fps: 30,
  durationFrames: 300,
} as unknown as ProjectDoc;

const fakePreset: RenderPreset = {
  key: '1080p',
  width: 1920,
  height: 1080,
  fps: 30,
  format: 'mp4',
  codec: 'h264',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('remotion-renderer / renderComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default (no path — local dev mode).
    mockConfig.chromiumExecutablePath = undefined;
    mockBundle.mockResolvedValue(BUNDLE_URL);
    mockSelectComposition.mockResolvedValue(fakeComposition);
    mockRenderMedia.mockResolvedValue(undefined);
  });

  it('passes browserExecutable to selectComposition and renderMedia when config path is set', async () => {
    mockConfig.chromiumExecutablePath = '/usr/bin/chromium';

    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/out.mp4',
      assetUrls: {},
    });

    expect(mockSelectComposition).toHaveBeenCalledOnce();
    const selectArgs = mockSelectComposition.mock.calls[0]![0] as Record<string, unknown>;
    expect(selectArgs['browserExecutable']).toBe('/usr/bin/chromium');

    expect(mockRenderMedia).toHaveBeenCalledOnce();
    const renderArgs = mockRenderMedia.mock.calls[0]![0] as Record<string, unknown>;
    expect(renderArgs['browserExecutable']).toBe('/usr/bin/chromium');
  });

  it('passes null as browserExecutable when chromiumExecutablePath is undefined', async () => {
    mockConfig.chromiumExecutablePath = undefined;

    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/out.mp4',
      assetUrls: {},
    });

    const selectArgs = mockSelectComposition.mock.calls[0]![0] as Record<string, unknown>;
    expect(selectArgs['browserExecutable']).toBeNull();

    const renderArgs = mockRenderMedia.mock.calls[0]![0] as Record<string, unknown>;
    expect(renderArgs['browserExecutable']).toBeNull();
  });

  it('passes the correct compositionId, codec, outputLocation, and inputProps to renderMedia', async () => {
    const assetUrls = { 'a1': 'https://s3.example.com/a1' };
    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/output.mp4',
      assetUrls,
    });

    const expectedProps = { ...fakeDoc, assetUrls };

    const selectArgs = mockSelectComposition.mock.calls[0]![0] as Record<string, unknown>;
    expect(selectArgs['inputProps']).toEqual(expectedProps);

    const renderArgs = mockRenderMedia.mock.calls[0]![0] as Record<string, unknown>;
    expect(renderArgs['codec']).toBe('h264');
    expect(renderArgs['outputLocation']).toBe('/tmp/output.mp4');
    expect(renderArgs['composition']).toBe(fakeComposition);
    expect(renderArgs['inputProps']).toEqual(expectedProps);
  });

  it('calls onProgress callback when renderMedia fires progress updates', async () => {
    // Simulate renderMedia calling onProgress.
    mockRenderMedia.mockImplementation(async (opts: Record<string, unknown>) => {
      const onProgress = opts['onProgress'] as ((p: { progress: number }) => void) | undefined;
      if (onProgress) {
        onProgress({ progress: 0.5 });
        onProgress({ progress: 1.0 });
      }
    });

    const progressValues: number[] = [];
    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/out.mp4',
      assetUrls: {},
      onProgress: (p) => progressValues.push(p),
    });

    expect(progressValues).toEqual([0.5, 1.0]);
  });

  it('propagates errors thrown by renderMedia', async () => {
    mockRenderMedia.mockRejectedValue(new Error('Chrome crash'));

    await expect(
      renderComposition({
        compositionId: 'VideoComposition',
        doc: fakeDoc,
        preset: fakePreset,
        outputPath: '/tmp/out.mp4',
        assetUrls: {},
      }),
    ).rejects.toThrow('Chrome crash');
  });

  it('calls bundle with an entry point ending in packages/remotion-comps/dist/remotion-entry.js', async () => {
    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/out.mp4',
      assetUrls: {},
    });

    expect(mockBundle).toHaveBeenCalledOnce();
    const bundleArgs = mockBundle.mock.calls[0]![0] as Record<string, unknown>;
    const entryPoint = bundleArgs['entryPoint'] as string;
    expect(entryPoint).toMatch(/packages[/\\]remotion-comps[/\\]dist[/\\]remotion-entry\.js$/);
  });

  it('uses bundle output URL as serveUrl for both selectComposition and renderMedia', async () => {
    mockBundle.mockResolvedValue('http://remotion-bundle:12345');

    await renderComposition({
      compositionId: 'VideoComposition',
      doc: fakeDoc,
      preset: fakePreset,
      outputPath: '/tmp/out.mp4',
      assetUrls: {},
    });

    const selectArgs = mockSelectComposition.mock.calls[0]![0] as Record<string, unknown>;
    expect(selectArgs['serveUrl']).toBe('http://remotion-bundle:12345');

    const renderArgs = mockRenderMedia.mock.calls[0]![0] as Record<string, unknown>;
    expect(renderArgs['serveUrl']).toBe('http://remotion-bundle:12345');
  });
});
