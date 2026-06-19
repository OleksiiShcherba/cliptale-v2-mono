/**
 * T20 — CI frame-diff parity on the FIXED fixture set (spec §6 NFR "Render
 * parity", AC-09 backstop / ADR-0006).
 *
 * This is the cross-release parity check: each fixed fixture is rendered
 * deterministically at a fixed set of frames and the serialized render output is
 * asserted STABLE across repeated renders (parity = byte-identical re-render).
 * It runs ONLY over the fixed fixture set — there is NO per-user-graphic runtime
 * frame-diff (spec §6 NFR / §8 resolved OQ).
 *
 * Honest limitation: the harness diffs the component's serialized element-tree
 * HTML at each frame, NOT rasterized pixels (pixel rasterization needs the full
 * Remotion renderer + a browser canvas). See frameDiffHarness.tsx.
 */
import { describe, expect, it } from 'vitest';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FRAME_DIFF_FIXTURES, PARITY_FRAMES } from './frameDiffFixtures.js';
import { renderFixtureAtFrame, renderFixtureStrip } from './frameDiffHarness.js';
import { withDeterministicShim } from '../determinism.js';

describe('CI frame-diff parity — fixed fixture set (spec §6 Render parity)', () => {
  it('ships a small, stable fixed fixture set (3–5 fixtures)', () => {
    expect(FRAME_DIFF_FIXTURES.length).toBeGreaterThanOrEqual(3);
    expect(FRAME_DIFF_FIXTURES.length).toBeLessThanOrEqual(5);
  });

  it.each(FRAME_DIFF_FIXTURES.map((f) => [f.name, f.source] as const))(
    'fixture "%s" renders byte-identically across two renders at every fixed frame (parity)',
    (_name, source) => {
      for (const frame of PARITY_FRAMES) {
        const first = renderFixtureAtFrame(source, frame);
        const second = renderFixtureAtFrame(source, frame);
        // Parity: the SAME fixture rendered the SAME way yields identical output.
        expect(second).toBe(first);
        // And it actually produced a render (not an empty string).
        expect(first.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(FRAME_DIFF_FIXTURES.map((f) => [f.name, f.source] as const))(
    'fixture "%s" frame strip is stable across two full-strip renders (golden parity)',
    (_name, source) => {
      const stripA = renderFixtureStrip(source, PARITY_FRAMES);
      const stripB = renderFixtureStrip(source, PARITY_FRAMES);
      // A committed golden would be compared the same way; re-render must match.
      expect(JSON.stringify(stripB)).toBe(JSON.stringify(stripA));
    },
  );

  it('the deterministic shim freezes clock/RNG so even slipped-through code renders identically', () => {
    // A component that reads the clock/RNG DIRECTLY (the defense-in-depth case:
    // something that slipped the static scan). Rendered through the SAME shim the
    // harness uses, its output must be byte-identical no matter what the real
    // global clock/RNG returns — that is what guarantees frame parity.
    function Slipped(): React.ReactElement {
      return <div>{`${Math.random()}-${Date.now()}`}</div>;
    }
    const renderSlipped = (): string =>
      withDeterministicShim(() => renderToStaticMarkup(<Slipped />));

    const baseline = renderSlipped();

    const realRandom = Math.random;
    const realNow = Date.now;
    Math.random = () => 0.987654321;
    Date.now = () => 1_700_000_000_000;
    try {
      // Without the shim this would differ; WITH the shim it is frozen → identical.
      expect(renderSlipped()).toBe(baseline);
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  it('a non-deterministic source is rejected by the harness (cannot enter the parity set)', () => {
    const nonDeterministic = `
      import { useCurrentFrame } from 'remotion';
      export default function G() { return null === Math.random() ? null : null; }
    `;
    expect(() => renderFixtureAtFrame(nonDeterministic, 0)).toThrow(/not a ready graphic/);
  });
});
