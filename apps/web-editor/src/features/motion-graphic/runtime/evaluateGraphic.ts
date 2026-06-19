/**
 * T15 — the "can this graphic reach ready?" decision (AC-09).
 *
 * A graphic only becomes `ready` if ALL of these hold:
 *   1. it transpiles + evaluates to a default-exported component (T14), AND
 *   2. it passes the author-time determinism AST scan (ADR-0006) — no banned
 *      time/random source and no off-allowlist import (ADR-0007), AND
 *   3. it then runs.
 *
 * `evaluateGraphic` runs the static gate (transpile → determinism scan) and
 * returns ONE total verdict the authoring view (T16) consumes to drive the
 * ready/failed state. Non-deterministic code never yields a `ready` component:
 * it surfaces as a fails-to-run verdict with the precise scan reason. This
 * function NEVER throws.
 */
import { transpileComponent } from './transpile.js';
import { scanDeterminism } from './determinism.js';
import type { DeterminismViolation } from './determinism.js';

import type { ComponentType } from 'react';

export type GraphicVerdict =
  | { ok: true; component: ComponentType<Record<string, unknown>> }
  | { ok: false; reason: string; violations?: DeterminismViolation[] };

/**
 * Gate authored TSX to a ready/failed verdict. The determinism scan runs on the
 * RAW source (so banned constructs are caught before they reach `ready`); only
 * a clean scan proceeds to transpile + mount.
 */
export function evaluateGraphic(tsxSource: string): GraphicVerdict {
  // Static determinism gate FIRST: a non-deterministic graphic must never reach
  // ready, regardless of whether it would transpile (AC-09).
  const scan = scanDeterminism(tsxSource);
  if (!scan.ok) {
    return {
      ok: false,
      reason: scan.violations[0]?.reason ?? 'Graphic is not deterministic.',
      violations: scan.violations,
    };
  }

  const transpiled = transpileComponent(tsxSource);
  if (!transpiled.ok) {
    return { ok: false, reason: transpiled.error };
  }

  return { ok: true, component: transpiled.component };
}
