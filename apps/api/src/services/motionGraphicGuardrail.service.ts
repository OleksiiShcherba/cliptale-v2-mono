/**
 * motionGraphicGuardrail.service — server-side prompt guardrail + runtime allowlist.
 *
 * Implements the two controls of ADR-0007 (resolves spec §8 OQ-2):
 *
 *   1. assertPromptAllowed(prompt) — a PRE-GENERATION check that refuses
 *      prompts whose intent is data exfiltration or system subversion BEFORE
 *      any LLM call is made (spec §6 NFR — the malicious-prompt guardrail).
 *      Runs server-side so a tampered client cannot bypass it.
 *
 *   2. isImportAllowed(spec) / assertImportsAllowed(imports) — a minimal,
 *      REJECT-BY-DEFAULT import allowlist used to validate generated code at
 *      authoring time. Only the render runtime (Remotion, `remotion` +
 *      `@remotion/*`, pinned 4.0.443 per sad.md §3) and the schema lib (`zod`,
 *      sad.md §3) are permitted; everything else (fs, child_process, net, http,
 *      os, process, arbitrary npm packages, …) is rejected.
 *
 * Both controls back the self-only blast radius of ADR-0005 (no sandbox). This
 * file ships the MECHANISM only; the curated red-team corpus and the ≥95%
 * refusal threshold (spec §8 OQ-4) are owned by Security Lead and measured by
 * the T19 conformance suite, which tunes the patterns below — they are not the
 * authoritative red-team set themselves.
 *
 * Design posture: LOW false-positive. Benign animation/authoring language
 * ("a bouncing ball", "fade in the title", "slide up from the bottom") must
 * pass. The patterns therefore key on intent verbs/targets that have no
 * legitimate place in a declarative Remotion-component authoring prompt
 * (process.env, secrets, child_process, "ignore previous instructions",
 * "disable the sandbox", "leak the system prompt", …) rather than on broad
 * animation vocabulary.
 */

import { GateError } from '../lib/errors.js';

/** Stable machine code (HTTP 422 via GateError → UnprocessableEntityError). */
export const PROMPT_REJECTED_CODE = 'motion_graphic.prompt_rejected';

/**
 * Reject-by-default import allowlist (ADR-0007).
 *
 * - Render runtime: Remotion — the bare `remotion` package and any scoped
 *   `@remotion/*` package (e.g. `@remotion/player`, `@remotion/shapes`).
 * - Schema lib: `zod`.
 *
 * Anything not matched here is rejected.
 */
const ALLOWED_EXACT = new Set<string>(['remotion', 'zod']);
const ALLOWED_SCOPE_PREFIX = '@remotion/';

/**
 * Refusal heuristics for assertPromptAllowed. Each entry is a case-insensitive
 * pattern whose presence signals exfiltration or system-subversion INTENT.
 *
 * These are intentionally narrow: they target verbs/objects ("read
 * process.env", "leak the system prompt", "disable the sandbox", "import
 * child_process") that a legitimate Motion-Graphic authoring prompt never
 * needs, keeping false positives on benign animation prompts low. T19 tunes
 * this set against the curated red-team corpus.
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  // --- Exfiltration: reading host secrets / environment ---
  /\bprocess\.env\b/i,
  /\benv(?:ironment)?\s+(?:vars?|variables?)\b/i,
  /\b(?:read|dump|exfiltrate|steal|leak|extract|send|beacon|upload)\b[^.]*\b(?:secret|secrets|credential|credentials|api[\s_-]?key|token|password|cookie|cookies|session)\b/i,
  /\b(?:secret|secrets|credential|credentials|api[\s_-]?key|token|cookie|cookies|session)\b[^.]*\b(?:exfiltrate|exfiltration|leak|steal|beacon|to\s+https?:\/\/|to\s+an?\s+external)\b/i,
  // --- Exfiltration: leaking the model's own instructions ---
  /\b(?:reveal|print|show|output|leak|repeat|disclose|dump)\b[^.]*\bsystem\s+prompt\b/i,
  /\bsystem\s+prompt\b[^.]*\b(?:verbatim|word[\s-]for[\s-]word|in\s+full)\b/i,
  // --- Subversion: prompt-injection / instruction override ---
  /\bignore\b[^.]*\b(?:previous|prior|above|earlier|all)\b[^.]*\binstruction/i,
  /\bdisregard\b[^.]*\binstruction/i,
  /\b(?:disable|bypass|turn\s+off|escape|break\s+out\s+of)\b[^.]*\b(?:sandbox|guardrail|guard\s*rail|allowlist|allow\s*list|security)\b/i,
  // --- Subversion: reaching forbidden runtime/host surfaces ---
  /\b(?:import|require|use|load)\b[^.]*\b(?:child_process|fs|node:fs|node:net|node:child_process|net|dgram|http|https|os|vm|worker_threads)\b/i,
  /\bchild_process\b/i,
  /\beval\s*\(/i,
  /\bfetch\b[^.]*\b(?:internal|localhost|127\.0\.0\.1|169\.254|metadata)\b/i,
];

/**
 * PRE-GENERATION guardrail. Throws GateError(`motion_graphic.prompt_rejected`,
 * 422) when the prompt's intent is exfiltration or system subversion.
 *
 * Must be called server-side BEFORE any LLM call (ADR-0007). A null/empty/
 * whitespace prompt is treated as benign here — emptiness is an input-shape
 * concern for the caller's request validation, not a security refusal.
 *
 * The error message is deliberately generic (it reveals no detection internals
 * to a probing client); `details.reason` carries a stable machine tag.
 */
export function assertPromptAllowed(prompt: string): void {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return;
  }
  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(prompt)) {
      throw new GateError(
        'This prompt was refused because its intent appears to be data exfiltration or system subversion.',
        PROMPT_REJECTED_CODE,
        { reason: 'exfiltration_or_subversion_intent' },
      );
    }
  }
}

/**
 * Reject-by-default allowlist check for a single module specifier (ADR-0007).
 * Returns true ONLY for the render runtime (`remotion`, `@remotion/*`) and the
 * schema lib (`zod`); everything else returns false.
 */
export function isImportAllowed(moduleSpecifier: string): boolean {
  if (typeof moduleSpecifier !== 'string') return false;
  const spec = moduleSpecifier.trim();
  if (spec.length === 0) return false;
  if (ALLOWED_EXACT.has(spec)) return true;
  if (spec.startsWith(ALLOWED_SCOPE_PREFIX)) return true;
  return false;
}

/**
 * Assert that EVERY import in a generated module is on the allowlist. Throws
 * GateError(`motion_graphic.prompt_rejected`, 422) naming the disallowed
 * specifiers in `details.disallowed`. Used at authoring time alongside the
 * determinism AST scan (ADR-0006).
 */
export function assertImportsAllowed(imports: readonly string[]): void {
  const disallowed = imports.filter((spec) => !isImportAllowed(spec));
  if (disallowed.length > 0) {
    throw new GateError(
      'Generated code imports a module outside the allowed runtime surface.',
      PROMPT_REJECTED_CODE,
      { reason: 'import_not_allowed', disallowed },
    );
  }
}
