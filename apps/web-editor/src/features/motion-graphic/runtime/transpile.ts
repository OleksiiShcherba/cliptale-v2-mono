/**
 * In-browser transpile of AI-authored Remotion TSX (T14 / ADR-0004).
 *
 * The authored Motion Graphic is a Remotion component written as TSX. Before it
 * can be mounted into `<Player>` it must be (1) transpiled TSX → JS and (2)
 * evaluated to obtain its default-exported React component.
 *
 * We use **Sucrase** — a Babel-class-but-far-faster transpiler that runs
 * synchronously with no WASM — so the transpile cost stays comfortably inside
 * the ≤1500 ms live-preview budget (spec §6 NFR, ADR-0004 "Sucrase-class").
 *
 * The contract is a **total function**: any failure — a syntax error, a throw at
 * module-eval time, or a missing default export — is returned as a clean
 * `{ ok:false, error }` "fails-to-run" verdict (sad §6, AC-06). This function
 * NEVER throws; the caller (T16) records the verdict.
 *
 * NOTE: the determinism AST scan + the network/IO allowlist enforcement
 * (ADR-0006 / ADR-0007) are the NEXT task (T15). Here we only transpile + mount;
 * the `require` shim below intentionally exposes only `react` + `remotion`, the
 * render-runtime allowlist posture, so an authored module cannot pull arbitrary
 * modules — but the hard AST gate is T15.
 */
import React from 'react';
import * as Remotion from 'remotion';
import { transform } from 'sucrase';
import * as zod from 'zod';

import type { ComponentType } from 'react';

export type TranspileResult =
  | { ok: true; component: ComponentType<Record<string, unknown>> }
  | { ok: false; error: string };

/**
 * The module allowlist exposed to authored code via the CommonJS `require`
 * shim. Reject-by-default: anything not on this list throws at eval time and is
 * surfaced as a fails-to-run verdict (the runtime half of ADR-0007).
 */
const MODULE_ALLOWLIST: Record<string, unknown> = {
  react: React,
  remotion: Remotion,
  // `zod` is on the ADR-0007 authoring allowlist (and passes the determinism scan),
  // so the runtime require shim must provide it — otherwise an allowed prop-schema
  // import would scan-clean but throw "not available" at eval (fails-to-run).
  zod,
};

function requireShim(specifier: string): unknown {
  const mod = MODULE_ALLOWLIST[specifier];
  if (mod === undefined) {
    throw new Error(`Module "${specifier}" is not available in the runtime`);
  }
  return mod;
}

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
 * Transpile authored TSX and evaluate it to its default-exported component.
 *
 * @param tsxSource - the raw TSX the AI authored.
 * @returns `{ ok:true, component }` or `{ ok:false, error }` — never throws.
 */
/**
 * Defensively strip a wrapping markdown code fence (```` ```tsx … ``` ````) that a
 * model may have added despite the output contract. The primary strip happens at
 * stream-assembly time; this keeps the transpile path robust for any source
 * (e.g. previously-persisted code) that still carries a fence.
 */
function stripFences(src: string): string {
  const trimmed = src.trim();
  const openFence = /^```[^\n`]*\r?\n/;
  if (!openFence.test(trimmed)) return trimmed;
  return trimmed.replace(openFence, '').replace(/\r?\n?```[ \t]*\r?\n?$/, '').trim();
}

export function transpileComponent(tsxSource: string): TranspileResult {
  // ── Step 1: transpile TSX → CommonJS JS (synchronous, no WASM). ──
  let code: string;
  try {
    const out = transform(stripFences(tsxSource), {
      transforms: ['typescript', 'jsx', 'imports'],
      production: true,
    });
    code = out.code;
  } catch (err) {
    // Syntax errors land here — clean fails-to-run verdict.
    return { ok: false, error: toMessage(err) };
  }

  // ── Step 2: evaluate the module to obtain its default export. ──
  try {
    const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
    // The `imports` Sucrase transform rewrites `import` → `require(...)` and the
    // default export → `exports.default`. We provide `require` + `module` +
    // `exports` so the generated CommonJS module can resolve them.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const factory = new Function('require', 'module', 'exports', 'React', code);
    factory(requireShim, moduleObj, moduleObj.exports, React);

    // Prefer the default export (the output contract), but fall back to a named
    // `MotionGraphic` export — models intermittently emit the component as a bare
    // named export, and rejecting an otherwise-valid component over export syntax
    // is a poor Creator experience.
    const component =
      typeof moduleObj.exports.default === 'function'
        ? moduleObj.exports.default
        : moduleObj.exports.MotionGraphic;
    if (typeof component !== 'function') {
      return { ok: false, error: 'Authored code has no default-exported component' };
    }
    return { ok: true, component: component as ComponentType<Record<string, unknown>> };
  } catch (err) {
    // Throws at module-eval time (e.g. top-level throw, disallowed import).
    return { ok: false, error: toMessage(err) };
  }
}
