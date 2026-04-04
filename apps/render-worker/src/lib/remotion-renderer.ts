import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

import type { RenderPreset } from '@ai-video-editor/project-schema';
import type { ProjectDoc } from '@ai-video-editor/project-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the remotion-comps package entry point, resolved relative to the
 * render-worker source. The built `dist/index.js` is used because this worker
 * runs from compiled output.
 */
const REMOTION_ENTRY_POINT = path.resolve(
  __dirname,
  '../../../packages/remotion-comps/dist/index.js',
);

/** Options for renderComposition. */
export type RenderCompositionOptions = {
  compositionId: string;
  doc: ProjectDoc;
  preset: RenderPreset;
  outputPath: string;
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
  const { compositionId, doc, preset, outputPath, onProgress } = options;

  // Bundle the composition — Webpack bundles remotion-comps into a temporary directory.
  const bundleLocation = await bundle({ entryPoint: REMOTION_ENTRY_POINT });

  // Select the composition metadata (durationInFrames, fps, width, height).
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: doc,
  });

  // Render the composition to a video file.
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: preset.codec,
    outputLocation: outputPath,
    inputProps: doc,
    onProgress: onProgress
      ? ({ progress }) => {
          onProgress(progress);
        }
      : undefined,
  });
}
