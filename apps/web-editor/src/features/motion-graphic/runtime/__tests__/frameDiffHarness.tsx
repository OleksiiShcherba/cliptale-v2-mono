/**
 * T20 — the CI frame-diff parity harness (spec §6 NFR "Render parity").
 *
 * WHAT THIS RENDERS (and its honest limitation):
 *   This harness does NOT rasterize pixels. Rasterizing Remotion to real pixels
 *   needs the full Remotion renderer plus a browser canvas — too heavy for a CI
 *   unit run. Instead, for each fixed fixture it:
 *     1. gates the source through the SAME runtime path the browser uses
 *        (`evaluateGraphic`: determinism scan → transpile → component), then
 *     2. renders the actual transpiled component's element tree to deterministic
 *        static HTML (`renderToStaticMarkup`) at a fixed frame, with the
 *        non-deterministic global sources FROZEN (`withDeterministicShim`) so
 *        Date.now()/Math.random()/performance.now() cannot perturb output.
 *   The serialized HTML is the "frame" we diff. Two renders of the same fixture
 *   at the same frame MUST be byte-identical (parity = stable serialized render),
 *   and a committed golden lets the check also catch cross-release drift.
 *
 *   The frame is supplied via Remotion's `window.remotion_initialFrame` (read by
 *   `useCurrentFrame()` when there is no `<Player>` composition), wrapped in the
 *   `CanUseRemotionHooksProvider` + `TimelineContext` so `useCurrentFrame()` is
 *   legal outside the Player — faithful to how the authored component reads the
 *   frame, without booting the whole Player.
 *
 * This is a FIXED-FIXTURE-SET CI check ONLY. It is NOT a per-user-graphic
 * runtime frame-diff (spec §6 NFR / §8 resolved OQ explicitly forbids that).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Internals } from 'remotion';

import { evaluateGraphic } from '../evaluateGraphic.js';
import { withDeterministicShim } from '../determinism.js';

const TimelineContext = Internals.TimelineContext;
const CanUseRemotionHooksProvider = Internals.CanUseRemotionHooksProvider;

/**
 * The minimal timeline context value `useCurrentFrame()` needs. The frame itself
 * is read from `window.remotion_initialFrame` (there is no composition), so the
 * per-composition `frame` map can be empty.
 */
function makeTimelineValue(): React.ContextType<typeof TimelineContext> {
  return {
    frame: {},
    playing: false,
    rootId: '',
    imperativePlaying: { current: false },
    playbackRate: 1,
    setPlaybackRate: () => undefined,
    audioAndVideoTags: { current: [] },
  } as unknown as React.ContextType<typeof TimelineContext>;
}

/**
 * Render a fixture's transpiled component to deterministic static HTML at a
 * fixed frame. Throws if the source does not gate to a ready component (a parity
 * fixture must be deterministic + runnable by construction).
 */
export function renderFixtureAtFrame(source: string, frame: number): string {
  const verdict = evaluateGraphic(source);
  if (!verdict.ok) {
    throw new Error(
      `Fixture is not a ready graphic (frame-diff parity requires deterministic, runnable fixtures): ${verdict.reason}`,
    );
  }

  const Component = verdict.component;

  return withDeterministicShim(() => {
    const w = globalThis as unknown as { remotion_initialFrame?: number };
    const previous = w.remotion_initialFrame;
    w.remotion_initialFrame = frame;
    try {
      return renderToStaticMarkup(
        <CanUseRemotionHooksProvider>
          <TimelineContext.Provider value={makeTimelineValue()}>
            <Component />
          </TimelineContext.Provider>
        </CanUseRemotionHooksProvider>,
      );
    } finally {
      w.remotion_initialFrame = previous;
    }
  });
}

/**
 * Render a fixture across a set of fixed frames → a frame→HTML map. This is the
 * "frame strip" we assert parity over.
 */
export function renderFixtureStrip(
  source: string,
  frames: readonly number[],
): Record<number, string> {
  const strip: Record<number, string> = {};
  for (const f of frames) {
    strip[f] = renderFixtureAtFrame(source, f);
  }
  return strip;
}
