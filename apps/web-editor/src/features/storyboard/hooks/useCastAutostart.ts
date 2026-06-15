/**
 * useCastAutostart — STUB retained for test compatibility only.
 *
 * T15: the old client-side cast-autostart hook has been retired. Cast extraction
 * is now driven by the server-side pipeline (usePipelineState). This file keeps
 * the module path alive so that StoryboardPage.test.tsx (which imports
 * __resetCastAutostartGuard) does not break; the guard is a no-op now.
 */

/** No-op: the module-level autostart guard has been retired with the hook. */
export function __resetCastAutostartGuard(): void {
  // no-op — the per-draft guard lives in the server pipeline now
}

export function castExtractionQueryKey(draftId: string) {
  return ['cast-extraction', draftId] as const;
}
