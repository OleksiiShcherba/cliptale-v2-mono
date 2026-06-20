import { describe, it, expect } from 'vitest';

import { evaluateGraphic } from './evaluateGraphic.js';

/**
 * Regression for the missing render-probe gate (AC-06 / AC-14).
 *
 * `evaluateGraphic` documents three conditions for `ready`: transpiles, passes
 * the determinism scan, AND "it then runs". The first two were enforced; the
 * third was not — a component that transpiles + is deterministic but THROWS the
 * moment Remotion renders it (e.g. `interpolate` given a colour outputRange,
 * which Remotion rejects at render time) slipped through as `ok:true` and was
 * persisted `ready`, producing a broken live preview instead of the AC-06 /
 * AC-14 fails-to-run path.
 */

// Transpiles fine, passes the determinism scan (no Date/Math.random), but
// `interpolate` validates that outputRange contains only numbers and THROWS at
// render time when handed colour strings.
const RENDER_THROWS_TSX = `
import React from 'react';
import { interpolate, useCurrentFrame, AbsoluteFill } from 'remotion';

export default function Broken() {
  const frame = useCurrentFrame();
  const color = interpolate(frame, [0, 30], ['#001f3f', '#FFA500']);
  return <AbsoluteFill style={{ background: color }}>x</AbsoluteFill>;
}
`;

const RUNNABLE_TSX = `
import React from 'react';
import { interpolate, useCurrentFrame, AbsoluteFill } from 'remotion';

export default function Good() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity }}>ok</AbsoluteFill>;
}
`;

// Uses useVideoConfig() — the recommended, prompt-encouraged way to derive frame
// counts / geometry. The render-probe MUST provide a video config so this does
// NOT false-fail with "No video config found".
const USES_VIDEO_CONFIG_TSX = `
import React from 'react';
import { interpolate, interpolateColors, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';

export default function Good() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const enter = Math.min(fps, durationInFrames);
  const x = interpolate(frame, [0, enter], [-width, 0], { extrapolateRight: 'clamp' });
  const bg = interpolateColors(frame, [0, durationInFrames], ['#001f3f', '#FFA500']);
  return <AbsoluteFill style={{ background: bg, transform: 'translateX(' + x + 'px)' }}>ok</AbsoluteFill>;
}
`;

describe('evaluateGraphic render-probe (AC-06 / AC-14)', () => {
  it('classifies a graphic that transpiles + is deterministic but THROWS at render as fails-to-run', () => {
    const verdict = evaluateGraphic(RENDER_THROWS_TSX);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toMatch(/outputRange must contain only numbers/i);
    }
  });

  it('still accepts a deterministic, runnable graphic (no false positive)', () => {
    expect(evaluateGraphic(RUNNABLE_TSX).ok).toBe(true);
  });

  it('accepts a graphic that calls useVideoConfig() + interpolateColors (probe provides video config)', () => {
    const verdict = evaluateGraphic(USES_VIDEO_CONFIG_TSX);
    expect(verdict.ok).toBe(true);
  });
});
