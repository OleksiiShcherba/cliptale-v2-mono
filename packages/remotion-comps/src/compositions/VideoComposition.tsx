import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { VideoLayer } from '../layers/VideoLayer.js';
import { AudioLayer } from '../layers/AudioLayer.js';
import { ImageLayer } from '../layers/ImageLayer.js';
import { TextOverlayLayer } from '../layers/TextOverlayLayer.js';

interface VideoCompositionProps {
  /** The full project document — passed as Remotion inputProps. */
  projectDoc: ProjectDoc;
  /** Map from assetId to presigned URL; resolved before rendering starts. */
  assetUrls: Record<string, string>;
}

/**
 * Root Remotion composition. Accepts ProjectDoc as inputProps.
 * Used by both the browser Player and the render-worker SSR pipeline.
 */
export function VideoComposition({ projectDoc, assetUrls }: VideoCompositionProps): React.ReactElement {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {projectDoc.clips.map((clip) => {
        if (clip.type === 'video') {
          const src = assetUrls[clip.assetId] ?? '';
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
              <VideoLayer src={src} volume={clip.volume} />
            </Sequence>
          );
        }

        if (clip.type === 'audio') {
          const src = assetUrls[clip.assetId] ?? '';
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
              <AudioLayer src={src} volume={clip.volume} />
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
