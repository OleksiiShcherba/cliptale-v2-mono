import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';

import { VideoComposition } from '@ai-video-editor/remotion-comps';
import type { ProjectDoc, MotionGraphicClip } from '@ai-video-editor/project-schema';

import { MotionGraphicClipLayer } from '@/features/motion-graphic/runtime';

interface EditorVideoCompositionProps {
  projectDoc: ProjectDoc;
  assetUrls: Record<string, string>;
}

/**
 * Editor-only Remotion composition. Wraps the shared `VideoComposition` (which
 * renders the file-backed + text/caption clips and is also used by the SSR
 * render worker) and layers AI-authored **motion-graphic** clips on top.
 *
 * Motion-graphic clips are rendered ONLY here, in the browser preview — the
 * shared composition deliberately ignores them so the render worker does not
 * attempt server-side execution of authored code (deferred, spec §3). Each
 * graphic mounts inside its own `<Sequence>` so its frame-driven animation is
 * positioned at the clip's start and lasts its duration; the graphic stack
 * renders above the base layers (motion graphics are overlay titles / lower-
 * thirds / infographics, which belong on top).
 */
export function EditorVideoComposition({
  projectDoc,
  assetUrls,
}: EditorVideoCompositionProps): React.ReactElement {
  const mutedTrackIds = new Set(
    projectDoc.tracks.filter((t) => t.muted).map((t) => t.id),
  );
  const motionGraphicClips = projectDoc.clips.filter(
    (c): c is MotionGraphicClip => c.type === 'motion-graphic' && !mutedTrackIds.has(c.trackId),
  );

  return (
    <AbsoluteFill>
      <VideoComposition projectDoc={projectDoc} assetUrls={assetUrls} />
      {motionGraphicClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <MotionGraphicClipLayer code={clip.code} opacity={clip.opacity} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
