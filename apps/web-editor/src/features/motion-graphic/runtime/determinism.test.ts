/**
 * T15 — Determinism enforcement (AC-09): author-time AST scan + runtime shim.
 *
 * RED-first: encodes the deterministic-pass case + EACH non-deterministic-reject
 * case (Date.now / new Date / Math.random / performance.now / off-allowlist
 * import) for the static AST scan (ADR-0006), the import allowlist (ADR-0007),
 * and the defense-in-depth runtime shim that freezes those sources.
 */
import { describe, expect, it } from 'vitest';

import {
  scanDeterminism,
  withDeterministicShim,
  DETERMINISM_FROZEN_EPOCH_MS,
  DETERMINISM_FROZEN_RANDOM,
} from './determinism.js';

// A deterministic Remotion component: animates only from useCurrentFrame().
const DETERMINISTIC_SRC = `
import React from 'react';
import { useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';

export default function MyGraphic() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <AbsoluteFill style={{ opacity }} />;
}
`;

describe('scanDeterminism — deterministic pass (AC-09)', () => {
  it('accepts a useCurrentFrame()-only component', () => {
    const result = scanDeterminism(DETERMINISTIC_SRC);
    expect(result.ok).toBe(true);
  });
});

describe('scanDeterminism — non-deterministic rejects (AC-09)', () => {
  it('rejects Date.now()', () => {
    const result = scanDeterminism(`
      import { useCurrentFrame } from 'remotion';
      export default function G() { const t = Date.now(); return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(result.violations.some((v) => /Date\.now/.test(v.reason))).toBe(true);
  });

  it('rejects new Date()', () => {
    const result = scanDeterminism(`
      export default function G() { const d = new Date(); return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(result.violations.some((v) => /new Date/.test(v.reason))).toBe(true);
  });

  it('rejects Math.random()', () => {
    const result = scanDeterminism(`
      export default function G() { const r = Math.random(); return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(result.violations.some((v) => /Math\.random/.test(v.reason))).toBe(true);
  });

  it('rejects performance.now()', () => {
    const result = scanDeterminism(`
      export default function G() { const t = performance.now(); return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(result.violations.some((v) => /performance\.now/.test(v.reason))).toBe(true);
  });

  it('rejects window.performance.now()', () => {
    const result = scanDeterminism(`
      export default function G() { const t = window.performance.now(); return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(result.violations.some((v) => /performance\.now/.test(v.reason))).toBe(true);
  });

  it('rejects an off-allowlist import (fs)', () => {
    const result = scanDeterminism(`
      import fs from 'fs';
      export default function G() { return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(
      result.violations.some((v) => v.kind === 'off-allowlist-import' && /fs/.test(v.reason)),
    ).toBe(true);
  });

  it('rejects an off-allowlist require()', () => {
    const result = scanDeterminism(`
      const net = require('net');
      export default function G() { return null; }
    `);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected reject');
    expect(
      result.violations.some((v) => v.kind === 'off-allowlist-import' && /net/.test(v.reason)),
    ).toBe(true);
  });

  it('accepts allowlisted imports (react / remotion / @remotion/* / zod)', () => {
    const result = scanDeterminism(`
      import React from 'react';
      import { useCurrentFrame } from 'remotion';
      import { Player } from '@remotion/player';
      import { z } from 'zod';
      export default function G() { return null; }
    `);
    expect(result.ok).toBe(true);
  });
});

describe('withDeterministicShim — runtime freeze (ADR-0006 defense-in-depth)', () => {
  it('freezes Math.random() to the frozen constant during execution', () => {
    const inside = withDeterministicShim(() => Math.random());
    expect(inside).toBe(DETERMINISTIC_FROZEN_RANDOM_VALUE());
  });

  it('freezes Date.now() to the frozen epoch during execution', () => {
    const inside = withDeterministicShim(() => Date.now());
    expect(inside).toBe(DETERMINISM_FROZEN_EPOCH_MS);
  });

  it('freezes new Date().getTime() to the frozen epoch during execution', () => {
    const inside = withDeterministicShim(() => new Date().getTime());
    expect(inside).toBe(DETERMINISM_FROZEN_EPOCH_MS);
  });

  it('freezes performance.now() to a fixed value during execution', () => {
    const inside = withDeterministicShim(() => performance.now());
    expect(inside).toBe(0);
  });

  it('restores the real sources after execution', () => {
    const before = Math.random;
    withDeterministicShim(() => 0);
    expect(Math.random).toBe(before);
  });
});

function DETERMINISTIC_FROZEN_RANDOM_VALUE(): number {
  return DETERMINISM_FROZEN_RANDOM;
}
