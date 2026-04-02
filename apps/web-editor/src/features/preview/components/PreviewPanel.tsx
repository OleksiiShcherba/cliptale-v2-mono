import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';

import { VideoComposition } from '@ai-video-editor/remotion-comps';

import { useRemotionPlayer } from '@/features/preview/hooks/useRemotionPlayer.js';

interface PreviewPanelProps {
  /**
   * Optional external player ref. When provided, it is forwarded to the
   * Remotion `<Player>` so that the parent can control playback via
   * `PlaybackControls`. If omitted the panel creates its own ref (used when
   * rendered standalone, e.g. in tests or Storybook).
   */
  playerRef?: React.RefObject<PlayerRef | null>;
}

/**
 * Remotion Player panel. Fills its container with a 16:9 letterboxed video
 * preview fed by the project store and resolved asset URLs.
 *
 * `inputProps` is memoized on projectDoc identity and assetUrls reference so
 * the composition does not re-mount during scrubbing (Remotion requirement).
 */
export function PreviewPanel({ playerRef: externalPlayerRef }: PreviewPanelProps = {}): React.ReactElement {
  const { projectDoc, assetUrls, playerRef: internalPlayerRef } = useRemotionPlayer();

  const playerRef = externalPlayerRef ?? internalPlayerRef;

  const inputProps = useMemo(
    () => ({ projectDoc, assetUrls }),
    [projectDoc, assetUrls],
  );

  return (
    <div style={styles.container}>
      <Player
        ref={playerRef}
        component={VideoComposition}
        inputProps={inputProps}
        fps={projectDoc.fps}
        durationInFrames={projectDoc.durationFrames}
        compositionWidth={projectDoc.width}
        compositionHeight={projectDoc.height}
        style={styles.player}
        // Remotion's built-in controls are hidden — PlaybackControls provides the UI.
        controls={false}
      />
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0D0D14',
    overflow: 'hidden',
  },
  player: {
    // Fill the container while maintaining the composition aspect ratio.
    // Remotion handles the internal scaling; the outer div constrains the bounds.
    width: '100%',
    height: '100%',
  },
} as const;
