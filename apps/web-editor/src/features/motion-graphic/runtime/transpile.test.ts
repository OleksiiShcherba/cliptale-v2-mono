import { describe, it, expect } from 'vitest';

import { transpileComponent } from './transpile.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal, valid Remotion component authored as TSX. */
const VALID_TSX = `
import React from 'react';
import { interpolate, useCurrentFrame, AbsoluteFill } from 'remotion';

export default function MyGraphic() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <AbsoluteFill style={{ opacity }}>Hello</AbsoluteFill>;
}
`;

/** A TSX with a syntax error — must NOT throw, must return ok:false. */
const SYNTAX_ERROR_TSX = `
import React from 'react';
export default function Broken( {
  return <div>oops</div>;
}
`;

/** Valid syntax but throws at module-eval time. */
const THROWS_AT_EVAL_TSX = `
import React from 'react';
throw new Error('boom at eval');
export default function Never() { return <div />; }
`;

/** Valid syntax but no default export. */
const NO_DEFAULT_EXPORT_TSX = `
import React from 'react';
export function Named() { return <div />; }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('transpileComponent', () => {
  it('transpiles a valid Remotion TSX component and yields a component (ok:true)', () => {
    const result = transpileComponent(VALID_TSX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.component).toBe('function');
    }
  });

  it('returns ok:false with an error string for a syntax error — does NOT throw', () => {
    let result: ReturnType<typeof transpileComponent> | undefined;
    expect(() => {
      result = transpileComponent(SYNTAX_ERROR_TSX);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns ok:false when the module throws at eval time — does NOT throw', () => {
    let result: ReturnType<typeof transpileComponent> | undefined;
    expect(() => {
      result = transpileComponent(THROWS_AT_EVAL_TSX);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.error).toContain('boom at eval');
    }
  });

  it('returns ok:false when there is no default-exported component', () => {
    const result = transpileComponent(NO_DEFAULT_EXPORT_TSX);
    expect(result.ok).toBe(false);
  });
});
