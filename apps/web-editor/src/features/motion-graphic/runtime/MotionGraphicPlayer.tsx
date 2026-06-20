import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';

import { evaluateGraphic } from './evaluateGraphic.js';
import { withDeterministicShim } from './determinism.js';

/**
 * Geometry for the runtime composition — duration drives `durationInFrames`
 * (duration_seconds * fps), the rest are passed straight to `<Player>`.
 */
export interface MotionGraphicGeometry {
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
}

interface MotionGraphicPlayerProps {
  /** The AI-authored Remotion TSX to transpile + mount. */
  code: string;
  geometry: MotionGraphicGeometry;
  /** Optional external player ref forwarded to `<Player>` (mirrors PreviewPanel). */
  playerRef?: React.RefObject<PlayerRef | null>;
}

/**
 * Runtime composition wrapper. The authored component renders inside an
 * `AbsoluteFill` so it always fills the composition canvas. Remotion needs a
 * stable component identity for `<Player>`, so the wrapper closes over the
 * transpiled component passed via `inputProps` rather than re-creating it.
 */
type RuntimeCompositionProps = {
  Component: React.ComponentType<Record<string, unknown>>;
};

function RuntimeComposition({ Component }: RuntimeCompositionProps): React.ReactElement {
  // Defense-in-depth (ADR-0006): even though the determinism AST scan gates the
  // ready state, freeze the non-deterministic sources during the authored
  // component's render so anything that slipped the scan stays reproducible.
  return withDeterministicShim(() => (
    <AbsoluteFill>
      <Component />
    </AbsoluteFill>
  ));
}

/**
 * Browser runtime preview (T14 / AC-02). Transpiles the authored TSX and mounts
 * the resulting component full-canvas in Remotion's `<Player>`, mirroring the
 * `PreviewPanel` Player pattern (durationInFrames/fps/compositionWidth/Height,
 * 16:9-style letterbox container).
 *
 * Transpile is synchronous (Sucrase), so the first render already has the
 * component — keeping runtime init inside the ≤1500 ms preview budget (ADR-0004).
 *
 * A non-compiling / throwing component yields a clean "fails-to-run" verdict:
 * the Player is NOT mounted and a fallback region is rendered instead (no broken
 * preview), feeding the AC-06 path. Determinism enforcement (AST scan) is T15.
 */
export function MotionGraphicPlayer({
  code,
  geometry,
  playerRef,
}: MotionGraphicPlayerProps): React.ReactElement {
  // The gated verdict (determinism scan → transpile) is pure + synchronous;
  // memoize on the source so scrubbing/replays do not re-evaluate and the
  // component identity stays stable for Remotion. A non-deterministic graphic
  // (AC-09) returns ok:false here, so it never mounts — it shows fails-to-run.
  const result = useMemo(() => evaluateGraphic(code), [code]);

  const durationInFrames = Math.max(
    1,
    Math.round(geometry.durationSeconds * geometry.fps),
  );

  const inputProps = useMemo<RuntimeCompositionProps | null>(
    () => (result.ok ? { Component: result.component } : null),
    [result],
  );

  if (!result.ok || inputProps === null) {
    return (
      <div style={styles.container}>
        <div data-testid="motion-graphic-fails-to-run" style={styles.failsToRun}>
          This Motion Graphic could not run.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Player
        ref={playerRef as React.Ref<PlayerRef> | undefined}
        component={RuntimeComposition}
        inputProps={inputProps}
        fps={geometry.fps}
        durationInFrames={durationInFrames}
        compositionWidth={geometry.width}
        compositionHeight={geometry.height}
        style={styles.player}
        // AC-02 / US-03: the Creator must WATCH the graphic play back in real
        // time. A static frame-0 mount shows a black box for any intro/slide/
        // fade graphic, so auto-play + loop the preview and expose controls so
        // they can pause / scrub / replay.
        autoPlay
        loop
        controls
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
    width: '100%',
    height: '100%',
  },
  failsToRun: {
    color: '#E5E5EA',
    fontSize: 14,
    textAlign: 'center' as const,
    padding: 16,
  },
} as const;
