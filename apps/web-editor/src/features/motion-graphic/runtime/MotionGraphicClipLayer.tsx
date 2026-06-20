import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';

import { evaluateGraphic } from './evaluateGraphic.js';
import { withDeterministicShim } from './determinism.js';

interface MotionGraphicClipLayerProps {
  /** The frozen TSX snapshot of the motion graphic, transpiled + mounted here. */
  code: string;
  /** Clip opacity (0–1), applied to the whole graphic layer. */
  opacity?: number;
}

/**
 * Renders an AI-authored Motion Graphic clip INSIDE an existing Remotion
 * composition (the editor preview), as opposed to `MotionGraphicPlayer` which
 * mounts its own standalone `<Player>`. This layer is meant to live within a
 * `<Sequence>` so the authored component's `useCurrentFrame()` is sequence-local
 * (frame 0 = clip start), which is exactly the deterministic, frame-driven
 * contract the graphic was authored against (AC-09).
 *
 * Transpile/evaluate is memoized on `code` so the composition can re-render every
 * frame during playback/scrub without re-transpiling. A graphic that fails to
 * evaluate (should not happen — only `ready` graphics are insertable) renders
 * nothing rather than crashing the whole preview tree.
 */
export function MotionGraphicClipLayer({
  code,
  opacity = 1,
}: MotionGraphicClipLayerProps): React.ReactElement | null {
  const verdict = useMemo(() => evaluateGraphic(code), [code]);

  if (!verdict.ok) return null;

  const Component = verdict.component;

  // Defense-in-depth (ADR-0006): freeze non-deterministic sources during the
  // authored component's render, mirroring MotionGraphicPlayer's RuntimeComposition.
  return withDeterministicShim(() => (
    <AbsoluteFill style={{ opacity }}>
      <Component />
    </AbsoluteFill>
  ));
}
