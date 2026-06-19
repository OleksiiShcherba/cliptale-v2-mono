/**
 * T20 — the FIXED fixture set for the CI frame-diff parity check (spec §6 NFR
 * "Render parity", AC-09).
 *
 * This is the parity CONTRACT: a small, stable, checked-in set of deterministic
 * Motion Graphic TSX sources. The CI frame-diff harness renders each one
 * deterministically at a fixed set of frames and asserts the output is STABLE
 * across repeated renders (parity). It is NOT a per-user-graphic runtime
 * frame-diff — it runs only over THIS fixed set (spec §8 resolved OQ).
 *
 * Every fixture here MUST obey the deterministic-render rule: it may animate
 * only from `useCurrentFrame()` (the frame position), never from wall-clock time
 * or randomness, so the browser preview is guaranteed to match a future server
 * export frame-for-frame (CONTEXT: Determinism).
 *
 * Keep this set small (3–5) and stable — it is a cross-release backstop.
 */

export interface FrameDiffFixture {
  /** Stable identifier used in test output + golden keys. */
  readonly name: string;
  /** Deterministic Remotion TSX source (useCurrentFrame-only). */
  readonly source: string;
}

/** A fade driven purely by frame → interpolate. */
const FADE_IN = `
import React from 'react';
import { useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';

export default function FadeIn() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity, background: '#101018' }}>Fade {frame}</AbsoluteFill>;
}
`;

/** A horizontal slide: translateX is a pure function of the frame. */
const SLIDE_X = `
import React from 'react';
import { useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';

export default function SlideX() {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 60], [-200, 200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <div style={{ transform: 'translateX(' + x + 'px)' }}>Slide</div>
    </AbsoluteFill>
  );
}
`;

/** A spring-less pulse: scale derived from a frame-modulated sine — still a
 * pure deterministic function of the frame (no Math.random, no Date). */
const PULSE_SCALE = `
import React from 'react';
import { useCurrentFrame, AbsoluteFill } from 'remotion';

export default function PulseScale() {
  const frame = useCurrentFrame();
  const scale = 1 + 0.1 * Math.sin(frame / 5);
  return (
    <AbsoluteFill>
      <div style={{ transform: 'scale(' + scale.toFixed(4) + ')' }}>Pulse</div>
    </AbsoluteFill>
  );
}
`;

/** A frame counter that also branches on the frame value (steps), exercising
 * conditional output that still depends only on the frame. */
const STEP_COUNTER = `
import React from 'react';
import { useCurrentFrame, AbsoluteFill } from 'remotion';

export default function StepCounter() {
  const frame = useCurrentFrame();
  const phase = frame < 30 ? 'intro' : frame < 60 ? 'hold' : 'outro';
  return (
    <AbsoluteFill>
      <span data-phase={phase}>{phase}:{frame}</span>
    </AbsoluteFill>
  );
}
`;

/**
 * The fixed fixture set. Small + stable on purpose (4 fixtures).
 */
export const FRAME_DIFF_FIXTURES: readonly FrameDiffFixture[] = [
  { name: 'fade-in', source: FADE_IN },
  { name: 'slide-x', source: SLIDE_X },
  { name: 'pulse-scale', source: PULSE_SCALE },
  { name: 'step-counter', source: STEP_COUNTER },
];

/** The fixed frames each fixture is rendered at for the parity check. */
export const PARITY_FRAMES: readonly number[] = [0, 15, 30, 45, 60];
