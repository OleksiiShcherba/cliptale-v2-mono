/**
 * T15 — Determinism enforcement (AC-09 / ADR-0006 + ADR-0007).
 *
 * Two layers protect the deterministic-render rule: a ready Motion Graphic must
 * animate only from its frame position (Remotion's `useCurrentFrame`), never
 * from wall-clock time or randomness, so the browser preview is guaranteed to
 * match the future server export frame-for-frame (CONTEXT: Determinism).
 *
 *   1. `scanDeterminism(tsxSource)` — an AUTHOR-TIME static AST scan that
 *      rejects, BEFORE a graphic can reach `ready`, the non-deterministic
 *      sources `Date.now()` / `new Date(...)` / `Math.random()` /
 *      `performance.now()` (incl. `window.performance.now()`) and any import
 *      outside the ADR-0007 allowlist — each with a precise plain-language
 *      reason. Parsing is AST-based (the TypeScript compiler API), never a
 *      brittle string regex.
 *
 *   2. `withDeterministicShim(fn)` — a RUNTIME shim that freezes those same
 *      sources during component execution as defense-in-depth, so even if a
 *      source slips the scan, execution stays deterministic (ADR-0006).
 *
 * The scan verdict feeds the browser's ready/failed decision: a graphic only
 * becomes `ready` if transpile is ok AND `scanDeterminism` is ok AND it runs.
 */
import ts from 'typescript';

/**
 * The import allowlist for authored code (ADR-0007). Reject-by-default; mirrors
 * the server-side `motionGraphicGuardrail.service` allowlist (`remotion`,
 * `@remotion/*`, `zod`) plus `react` — a Remotion component must import React,
 * and the runtime `require` shim (transpile.ts) already exposes it.
 */
const ALLOWED_EXACT = new Set<string>(['react', 'remotion', 'zod']);
const ALLOWED_SCOPE_PREFIX = '@remotion/';

/**
 * Fixed values the runtime shim freezes the banned sources to. Constant +
 * documented so a frozen graphic renders identically every run.
 */
export const DETERMINISM_FROZEN_EPOCH_MS = 0;
export const DETERMINISM_FROZEN_RANDOM = 0;

export type DeterminismViolationKind =
  | 'Date.now'
  | 'new Date'
  | 'Math.random'
  | 'performance.now'
  | 'off-allowlist-import';

export interface DeterminismViolation {
  kind: DeterminismViolationKind;
  reason: string;
  line?: number;
}

export type DeterminismScanResult =
  | { ok: true }
  | { ok: false; violations: DeterminismViolation[] };

function isImportAllowed(specifier: string): boolean {
  const spec = specifier.trim();
  if (spec.length === 0) return false;
  if (ALLOWED_EXACT.has(spec)) return true;
  if (spec.startsWith(ALLOWED_SCOPE_PREFIX)) return true;
  return false;
}

/**
 * Resolve a member-access chain to its dotted text (e.g. `window.performance.now`
 * → "window.performance.now"), or undefined if any link is not a plain
 * identifier/property access. Used to classify call/new expressions by shape.
 */
function memberChain(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const left = memberChain(node.expression);
    if (left === undefined) return undefined;
    return `${left}.${node.name.text}`;
  }
  return undefined;
}

/**
 * Author-time AST determinism scan (AC-09). Total function — never throws; a
 * syntactically invalid source simply yields no determinism violations here
 * (transpile already returns the fails-to-run verdict for syntax errors).
 */
export function scanDeterminism(tsxSource: string): DeterminismScanResult {
  const source = ts.createSourceFile(
    'authored.tsx',
    tsxSource,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const violations: DeterminismViolation[] = [];

  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    // ── Banned NEW expressions: new Date(...) ──
    if (ts.isNewExpression(node)) {
      const chain = memberChain(node.expression);
      if (chain === 'Date') {
        violations.push({
          kind: 'new Date',
          reason:
            'new Date() is non-deterministic (wall-clock time) — derive timing from the frame number via useCurrentFrame() instead.',
          line: lineOf(node),
        });
      }
    }

    // ── Banned CALL expressions on a member chain ──
    if (ts.isCallExpression(node)) {
      const chain = memberChain(node.expression);
      if (chain === 'Date.now') {
        violations.push({
          kind: 'Date.now',
          reason:
            'Date.now() is non-deterministic (wall-clock time) — derive timing from the frame number via useCurrentFrame() instead.',
          line: lineOf(node),
        });
      } else if (chain === 'Math.random') {
        violations.push({
          kind: 'Math.random',
          reason:
            'Math.random() is non-deterministic — use the frame number via useCurrentFrame() (and a seeded/derived value) so the render is reproducible.',
          line: lineOf(node),
        });
      } else if (chain === 'performance.now' || chain === 'window.performance.now') {
        violations.push({
          kind: 'performance.now',
          reason:
            'performance.now() is non-deterministic (wall-clock time) — derive timing from the frame number via useCurrentFrame() instead.',
          line: lineOf(node),
        });
      }

      // ── Off-allowlist require('x') ──
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteralLike(arg) && !isImportAllowed(arg.text)) {
          violations.push({
            kind: 'off-allowlist-import',
            reason: `require("${arg.text}") is outside the allowed runtime surface — only react, remotion, @remotion/*, and zod may be used.`,
            line: lineOf(node),
          });
        }
      }
    }

    // ── Off-allowlist static imports: import ... from 'x' ──
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (!isImportAllowed(spec)) {
        violations.push({
          kind: 'off-allowlist-import',
          reason: `import from "${spec}" is outside the allowed runtime surface — only react, remotion, @remotion/*, and zod may be used.`,
          line: lineOf(node),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true };
}

/**
 * Runtime shim (ADR-0006 defense-in-depth). Runs `fn` with the non-deterministic
 * global sources frozen to fixed values, then restores the originals — even if
 * `fn` throws. So `Date.now()`, `new Date()`, `Math.random()`, and
 * `performance.now()` all return constants during component execution, keeping
 * the render reproducible if anything slipped past the static scan.
 */
export function withDeterministicShim<T>(fn: () => T): T {
  const realDateNow = Date.now;
  const realRandom = Math.random;
  const realPerfNow =
    typeof performance !== 'undefined' ? performance.now.bind(performance) : undefined;
  const RealDate = globalThis.Date;

  // A frozen Date subclass: zero-arg construction yields the frozen epoch; an
  // explicit-arg construction (e.g. new Date(frame * 1000)) is preserved so a
  // deterministic, argument-driven Date still works.
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(DETERMINISM_FROZEN_EPOCH_MS);
      } else {
        // Explicit-arg construction is preserved so a deterministic,
        // argument-driven Date (e.g. new Date(frame * 1000)) still works.
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }

    static now(): number {
      return DETERMINISM_FROZEN_EPOCH_MS;
    }
  }

  Date.now = () => DETERMINISM_FROZEN_EPOCH_MS;
  Math.random = () => DETERMINISM_FROZEN_RANDOM;
  globalThis.Date = FrozenDate as DateConstructor;
  if (typeof performance !== 'undefined') {
    performance.now = () => DETERMINISM_FROZEN_EPOCH_MS;
  }

  try {
    return fn();
  } finally {
    Date.now = realDateNow;
    Math.random = realRandom;
    globalThis.Date = RealDate;
    if (typeof performance !== 'undefined' && realPerfNow) {
      performance.now = realPerfNow;
    }
  }
}
