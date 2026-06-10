/**
 * Vitest setup file — patches Node's require to allow loading .tsx/.ts files.
 *
 * Vitest's jsdom environment uses Node's createRequire, which does not resolve
 * .tsx / .ts extensions by default.  ReferenceGateMessage.test.tsx uses a
 * require() call inside a try/catch as a graceful RED-state import; the require
 * must succeed once the module exists (GREEN state).
 *
 * Approach: patch Module._extensions and Module._resolveFilename using the
 * TypeScript compiler's synchronous transpileModule — no esbuild required, so
 * this is safe in jsdom (which replaces TextEncoder, breaking esbuild's invariant).
 *
 * The TypeScript package is a workspace dev dependency (used for tsc).
 */

import Module from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';

type NodeModuleInternal = NodeModule & {
  _compile: (code: string, filename: string) => void;
};

type ModuleConstructor = typeof Module & {
  _extensions: Record<string, (mod: NodeModule, filename: string) => void>;
  _resolveFilename: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
    options?: Record<string, unknown>,
  ) => string;
};

const Mod = Module as unknown as ModuleConstructor;

// ── 1. Compile hook for .tsx / .ts ─────────────────────────────────────────────

function compileTsxWithTsc(mod: NodeModule, filename: string): void {
  const src = fs.readFileSync(filename, 'utf-8');
  const loader = filename.endsWith('.tsx') ? ts.JsxEmit.ReactJSX : undefined;
  const result = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      ...(loader !== undefined ? { jsx: loader } : {}),
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  });
  (mod as NodeModuleInternal)._compile(result.outputText, filename);
}

if (!Mod._extensions['.tsx']) {
  Mod._extensions['.tsx'] = compileTsxWithTsc;
}
if (!Mod._extensions['.ts']) {
  Mod._extensions['.ts'] = compileTsxWithTsc;
}

// ── 2. Resolution hook — extend require to try .tsx / .ts extensions ────────────

const originalResolveFilename = Mod._resolveFilename.bind(Mod);

Mod._resolveFilename = function patchedResolveFilename(
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
  options?: Record<string, unknown>,
): string {
  try {
    return originalResolveFilename(request, parent, isMain, options);
  } catch (err) {
    if (
      typeof request === 'string'
      && (request.startsWith('./') || request.startsWith('../'))
      && (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
    ) {
      for (const ext of ['.tsx', '.ts']) {
        try {
          return originalResolveFilename(request + ext, parent, isMain, options);
        } catch {
          // continue trying next extension
        }
      }
    }
    throw err;
  }
};
