/**
 * Render-probe — the "it then runs" half of the ready gate (AC-06 / AC-14).
 *
 * Transpiling + the determinism scan prove a graphic is *parseable* and
 * *deterministic*, but neither proves it actually RENDERS. Remotion validates a
 * lot at render time (e.g. `interpolate` rejects a non-numeric outputRange, a
 * bad `<Sequence>` range throws, an undefined read in the render body throws) —
 * none of which surfaces until the component's element tree is built. Without
 * this probe such a graphic gates `ok:true`, is persisted `ready`, and the live
 * `<Player>` then crashes into its error boundary (a broken preview) instead of
 * the AC-06 fails-to-run / AC-14 keep-last-working path.
 *
 * The probe renders the component to static HTML at a few representative frames,
 * inside the same minimal Remotion hook context the frame-diff harness uses
 * (`CanUseRemotionHooksProvider` + `TimelineContext` + `window.remotion_initialFrame`),
 * with the non-deterministic globals frozen (`withDeterministicShim`). Any throw
 * is returned as a clean fails-to-run error. This function NEVER throws.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Internals } from 'remotion';

import { withDeterministicShim } from './determinism.js';

import type { ComponentType } from 'react';

const TimelineContext = Internals.TimelineContext;
const CanUseRemotionHooksProvider = Internals.CanUseRemotionHooksProvider;
const CompositionManager = Internals.CompositionManager;

/**
 * A fixed composition geometry for the probe. The exact numbers do not matter —
 * the probe only checks "does it render without throwing", not pixel output — but
 * `useVideoConfig()` MUST return real numbers, since authored components routinely
 * (and per the system prompt, correctly) derive frame counts from
 * `useVideoConfig().fps` and lay out from `.width` / `.height`.
 */
const PROBE_COMPOSITION_ID = '__mg_probe__';
const PROBE_GEOMETRY = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 } as const;

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
 * The minimal composition-manager context value `useVideoConfig()` needs. With a
 * registered composition + `currentCompositionMetadata`, Remotion's
 * `useResolvedVideoConfig` resolves synchronously to a `success` config, so
 * `useVideoConfig()` returns geometry instead of throwing "No video config
 * found" (the false-negative a timeline-only context would produce).
 */
function makeCompositionManagerValue(
  Component: ComponentType<Record<string, unknown>>,
): React.ContextType<typeof CompositionManager> {
  return {
    compositions: [
      {
        id: PROBE_COMPOSITION_ID,
        component: { type: Component } as unknown,
        defaultProps: {},
        nonce: 0,
        ...PROBE_GEOMETRY,
      },
    ],
    folders: [],
    currentCompositionMetadata: { ...PROBE_GEOMETRY, props: {}, defaultProps: {} },
    canvasContent: { type: 'composition', compositionId: PROBE_COMPOSITION_ID },
  } as unknown as React.ContextType<typeof CompositionManager>;
}

/**
 * Render `Component` to deterministic static HTML at a fixed `frame`, inside the
 * Remotion hook context so `useCurrentFrame()` / `useVideoConfig()` are legal
 * outside a `<Player>`. Throws if the component throws while rendering.
 */
export function renderComponentAtFrame(
  Component: ComponentType<Record<string, unknown>>,
  frame: number,
): string {
  return withDeterministicShim(() => {
    const w = globalThis as unknown as { remotion_initialFrame?: number };
    const previous = w.remotion_initialFrame;
    w.remotion_initialFrame = frame;
    try {
      return renderToStaticMarkup(
        <CanUseRemotionHooksProvider>
          <CompositionManager.Provider value={makeCompositionManagerValue(Component)}>
            <TimelineContext.Provider value={makeTimelineValue()}>
              <Component />
            </TimelineContext.Provider>
          </CompositionManager.Provider>
        </CanUseRemotionHooksProvider>,
      );
    } finally {
      w.remotion_initialFrame = previous;
    }
  });
}

export type RenderProbeResult = { ok: true } | { ok: false; error: string };

/**
 * Frames the probe renders at. Frame 0 catches eager validation (e.g.
 * `interpolate` outputRange checks); the later frames catch throws that only
 * manifest mid-timeline (frame-indexed array reads, division-by-frame, etc.).
 * A handful of frames keeps the probe well inside the live-preview budget.
 */
const PROBE_FRAMES = [0, 1, 15, 30] as const;

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Probe that the transpiled component actually renders without throwing. Returns
 * a clean `{ ok:false, error }` for the first frame that throws; never throws.
 */
export function renderProbe(
  Component: ComponentType<Record<string, unknown>>,
): RenderProbeResult {
  for (const frame of PROBE_FRAMES) {
    try {
      renderComponentAtFrame(Component, frame);
    } catch (err) {
      return { ok: false, error: toMessage(err) };
    }
  }
  return { ok: true };
}
