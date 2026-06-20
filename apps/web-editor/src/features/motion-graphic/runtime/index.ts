/**
 * Browser runtime for the motion-graphic feature.
 *
 * T14 lands the transpile + `<Player>` mount: `transpileComponent` (TSX → a
 * default-exported React component, with a clean fails-to-run verdict) and
 * `MotionGraphicPlayer` (the runtime composition wrapper rendered full-canvas).
 *
 * The SSE stream client (generate/refine), the determinism AST scan (AC-09, T15),
 * and the verdict reporter (T16) land here next.
 */

export { transpileComponent } from './transpile.js';
export type { TranspileResult } from './transpile.js';
export { MotionGraphicPlayer } from './MotionGraphicPlayer.js';
export type { MotionGraphicGeometry } from './MotionGraphicPlayer.js';
export { MotionGraphicClipLayer } from './MotionGraphicClipLayer.js';

// T15 — determinism enforcement (AC-09 / ADR-0006 + ADR-0007).
export {
  scanDeterminism,
  withDeterministicShim,
  DETERMINISM_FROZEN_EPOCH_MS,
  DETERMINISM_FROZEN_RANDOM,
} from './determinism.js';
export type {
  DeterminismScanResult,
  DeterminismViolation,
  DeterminismViolationKind,
} from './determinism.js';
export { evaluateGraphic } from './evaluateGraphic.js';
export type { GraphicVerdict } from './evaluateGraphic.js';
