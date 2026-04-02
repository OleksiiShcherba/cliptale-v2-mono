import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { VideoLayer } from '../layers/VideoLayer.js';
import { AudioLayer } from '../layers/AudioLayer.js';
import { ImageLayer } from '../layers/ImageLayer.js';
import { TextOverlayLayer } from '../layers/TextOverlayLayer.js';
import { prepareClipsForComposition } from './VideoComposition.utils.js';

interface VideoCompositionProps {
  /** The full project document — passed as Remotion inputProps. */
  projectDoc: ProjectDoc;
  /** Map from assetId to presigned URL; resolved before rendering starts. */
  assetUrls: Record<string, string>;
}

/**
 * Root Remotion composition. Accepts ProjectDoc as inputProps.
 * Used by both the browser Player and the render-worker SSR pipeline.
 *
 * Clip pre-processing (z-order sort, mute filtering, trim passthrough) is
 * handled by `prepareClipsForComposition` (§5 — business logic must not live
 * inside compositions; it lives in the co-located utils module instead).
 *
 * Rendering order follows track array index — lower index = lower z-order.
 */
export function VideoComposition({ projectDoc, assetUrls }: VideoCompositionProps): React.ReactElement {
  // Pre-processing is in a pure utility — not in the composition (§5).
  const clips = prepareClipsForComposition(projectDoc);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {clips.map((clip) => {
        if (clip.type === 'video') {
          const src = assetUrls[clip.assetId] ?? '';
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
              <VideoLayer
                src={src}
                volume={clip.volume}
                startFrom={clip.trimInFrame}
                endAt={clip.trimOutFrame}
              />
            </Sequence>
          );
        }

        if (clip.type === 'audio') {
          const src = assetUrls[clip.assetId] ?? '';
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
              <AudioLayer
                src={src}
                volume={clip.volume}
                startFrom={clip.trimInFrame}
                endAt={clip.trimOutFrame}
              />
            </Sequence>
          );
        }

        if (clip.type === 'text-overlay') {
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
              <TextOverlayLayer
                text={clip.text}
                fontSize={clip.fontSize}
                color={clip.color}
                position={clip.position}
              />
            </Sequence>
          );
        }

        return null;
      })}
    </AbsoluteFill>
  );
}
