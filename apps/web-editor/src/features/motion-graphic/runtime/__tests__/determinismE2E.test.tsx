/**
 * T20 — determinism enforcement E2E (AC-09): a NON-deterministic graphic NEVER
 * reaches `ready`, end-to-end through the runtime path.
 *
 * "Ready" requires both running in the live preview AND meeting the
 * deterministic-render rule (spec AC-06/AC-09). This suite drives each
 * non-deterministic source — Date.now / new Date / Math.random / performance.now
 * — plus an off-allowlist import THROUGH the real ready-decision path
 * (`evaluateGraphic`) and asserts the verdict is `ok:false` (never a mounted
 * component). It then drives the same sources through `MotionGraphicPlayer`
 * (the component the authoring view mounts) and asserts the Player is NEVER
 * mounted — the fails-to-run fallback is shown instead. That is "never reaches
 * ready" proven end-to-end.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// The real @remotion/player cannot render in jsdom; capture its props so we can
// assert it is NEVER constructed for a non-deterministic graphic (mirrors
// runtime.test.tsx).
const { mockPlayerProps } = vi.hoisted(() => ({ mockPlayerProps: [] as Record<string, unknown>[] }));

vi.mock('@remotion/player', () => ({
  Player: React.forwardRef((props: Record<string, unknown>, _ref: React.Ref<unknown>) => {
    mockPlayerProps.push(props);
    return React.createElement('div', { 'data-testid': 'remotion-player' });
  }),
}));

import { evaluateGraphic } from '../evaluateGraphic.js';
import { MotionGraphicPlayer } from '../MotionGraphicPlayer.js';
import type { MotionGraphicGeometry } from '../MotionGraphicPlayer.js';

const GEOMETRY: MotionGraphicGeometry = {
  durationSeconds: 5,
  fps: 30,
  width: 1920,
  height: 1080,
};

/**
 * Each non-deterministic / off-allowlist source. Each MUST be blocked from ready.
 */
const NON_DETERMINISTIC_SOURCES: ReadonlyArray<readonly [string, string]> = [
  [
    'Date.now()',
    `
    import { useCurrentFrame } from 'remotion';
    export default function G() { const t = Date.now(); return null; }
  `,
  ],
  [
    'new Date()',
    `
    export default function G() { const d = new Date(); return null; }
  `,
  ],
  [
    'Math.random()',
    `
    export default function G() { const r = Math.random(); return null; }
  `,
  ],
  [
    'performance.now()',
    `
    export default function G() { const t = performance.now(); return null; }
  `,
  ],
  [
    'window.performance.now()',
    `
    export default function G() { const t = window.performance.now(); return null; }
  `,
  ],
  [
    'off-allowlist import (fs)',
    `
    import fs from 'fs';
    export default function G() { return null; }
  `,
  ],
  [
    'off-allowlist require (net)',
    `
    const net = require('net');
    export default function G() { return null; }
  `,
  ],
];

// A deterministic control: useCurrentFrame-only. MUST reach ready.
const DETERMINISTIC_SRC = `
import React from 'react';
import { useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';
export default function MyGraphic() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <AbsoluteFill style={{ opacity }}>Hi</AbsoluteFill>;
}
`;

describe('determinism E2E (AC-09) — evaluateGraphic never returns a ready component', () => {
  it.each(NON_DETERMINISTIC_SOURCES)(
    '"%s" → ok:false (never ready) with a reason',
    (_label, source) => {
      const verdict = evaluateGraphic(source);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) throw new Error('expected the graphic to be blocked from ready');
      expect(typeof verdict.reason).toBe('string');
      expect(verdict.reason.length).toBeGreaterThan(0);
      // It never hands back a component to mount.
      expect((verdict as { component?: unknown }).component).toBeUndefined();
    },
  );

  it('the deterministic control DOES reach ready (sanity — the gate is not blanket-deny)', () => {
    const verdict = evaluateGraphic(DETERMINISTIC_SRC);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error('expected the deterministic graphic to be ready');
    expect(typeof verdict.component).toBe('function');
  });
});

describe('determinism E2E (AC-09) — MotionGraphicPlayer never mounts a non-deterministic graphic', () => {
  beforeEach(() => {
    mockPlayerProps.length = 0;
  });

  it.each(NON_DETERMINISTIC_SOURCES)(
    '"%s" → Player NEVER mounts, fails-to-run fallback shown instead',
    (_label, source) => {
      const { queryByTestId } = render(
        <MotionGraphicPlayer code={source} geometry={GEOMETRY} />,
      );
      // Never reaches ready: no Player is mounted...
      expect(queryByTestId('remotion-player')).toBeNull();
      expect(mockPlayerProps.length).toBe(0);
      // ...and the fails-to-run region is shown instead.
      expect(queryByTestId('motion-graphic-fails-to-run')).not.toBeNull();
    },
  );

  it('the deterministic control DOES mount the Player (ready end-to-end)', () => {
    const { queryByTestId } = render(
      <MotionGraphicPlayer code={DETERMINISTIC_SRC} geometry={GEOMETRY} />,
    );
    expect(queryByTestId('remotion-player')).not.toBeNull();
    expect(mockPlayerProps.length).toBe(1);
    expect(queryByTestId('motion-graphic-fails-to-run')).toBeNull();
  });
});
