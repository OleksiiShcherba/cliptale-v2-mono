import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

import type { ProjectDoc, RenderPreset } from '@ai-video-editor/project-schema';

import { config } from '@/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the Remotion bundle entry point, resolved relative to the compiled
 * output directory.
 *
 * At runtime __dirname is `<root>/apps/render-worker/dist/lib`.
 * Four levels up reaches the monorepo root, then we descend into
 * `packages/remotion-comps/dist/remotion-entry.js` — the file that calls
 * `registerRoot()` and registers the VideoComposition.
 */
const REMOTION_ENTRY_POINT = path.resolve(
  __dirname,
  '../../../../packages/remotion-comps/dist/remotion-entry.js',
);

/** Options for renderComposition. */
export type RenderCompositionOptions = {
  compositionId: string;
  doc: ProjectDoc;
  preset: RenderPreset;
  outputPath: string;
  /** Map from fileId to a presigned URL the headless browser can fetch. */
  assetUrls: Record<string, string>;
  /** Called with progress values between 0 and 1 (e.g. 0.05, 0.10, ...). */
  onProgress?: (progress: number) => void;
};

/**
 * Bundles the remotion-comps entry point and renders the specified composition
 * to the given output path using the codec and format from the preset.
 *
 * Wraps Remotion's `bundle()` + `selectComposition()` + `renderMedia()` trio.
 */
export async function renderComposition(options: RenderCompositionOptions): Promise<void> {
  const { compositionId, doc, preset, outputPath, assetUrls, onProgress } = options;

  // Bundle the composition — Webpack bundles remotion-comps into a temporary directory.
  const bundleLocation = await bundle({ entryPoint: REMOTION_ENTRY_POINT });

  // Merge the project document with the resolved asset URLs so the
  // composition can access media files via presigned S3 URLs.
  const inputProps = { ...doc, assetUrls };

  // Select the composition metadata (durationInFrames, fps, width, height).
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
    browserExecutable: config.chromiumExecutablePath ?? null,
  });

  // Render the composition to a video file.
  // Pass browserExecutable when APP_CHROMIUM_EXECUTABLE_PATH is set (e.g. inside Docker
  // where Chromium is installed at /usr/bin/chromium).  When omitted, Remotion falls
  // back to its own auto-downloaded browser — appropriate for local development.
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: preset.codec,
    outputLocation: outputPath,
    inputProps,
    browserExecutable: config.chromiumExecutablePath ?? null,
    onProgress: onProgress
      ? ({ progress }) => {
          onProgress(progress);
        }
      : undefined,
  });
}
