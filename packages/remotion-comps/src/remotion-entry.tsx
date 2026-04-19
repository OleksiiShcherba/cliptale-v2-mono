import React from 'react';
import { Composition, registerRoot } from 'remotion';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { VideoComposition } from './compositions/VideoComposition.js';

/**
 * Input props type for the Remotion composition.
 *
 * Remotion passes `inputProps` as React props to this component.  The render
 * worker resolves presigned S3 URLs for every asset referenced by clips and
 * includes them in `assetUrls`.  The browser Player does the same via the API
 * stream endpoint.  When `assetUrls` is omitted (e.g. Remotion Studio
 * preview) the composition falls back to an empty map.
 */
type VideoRootProps = ProjectDoc & { assetUrls?: Record<string, string> };

function VideoRoot({ assetUrls, ...projectDoc }: VideoRootProps): React.ReactElement {
  return <VideoComposition projectDoc={projectDoc as ProjectDoc} assetUrls={assetUrls ?? {}} />;
}

/**
 * Root component registered with Remotion.
 *
 * `calculateMetadata` reads `fps`, `width`, `height`, and `durationFrames`
 * from the project document so every render uses the correct composition
 * dimensions without hardcoded defaults.
 */
function Root(): React.ReactElement {
  return (
    <Composition
      id="VideoComposition"
      component={VideoRoot}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        schemaVersion: 1 as const,
        id: '',
        title: '',
        fps: 30,
        durationFrames: 300,
        width: 1920,
        height: 1080,
        tracks: [],
        clips: [],
        createdAt: '',
        updatedAt: '',
        assetUrls: {},
      }}
      calculateMetadata={async ({ props }: { props: VideoRootProps }) => ({
        durationInFrames: props.durationFrames,
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
}

registerRoot(Root);
