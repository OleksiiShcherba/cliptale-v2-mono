import { describe, it, expect } from 'vitest';

import { stripCodeFences } from './useGenerateStream';

describe('stripCodeFences', () => {
  const CODE = "import { AbsoluteFill } from 'remotion';\nexport default function MotionGraphic() {\n  return <AbsoluteFill />;\n}";

  it('strips a ```tsx … ``` fence the model added around the component', () => {
    expect(stripCodeFences('```tsx\n' + CODE + '\n```')).toBe(CODE);
  });

  it('strips a bare ``` … ``` fence (no language tag)', () => {
    expect(stripCodeFences('```\n' + CODE + '\n```')).toBe(CODE);
  });

  it('leaves un-fenced source unchanged (only trims surrounding whitespace)', () => {
    expect(stripCodeFences('\n' + CODE + '\n')).toBe(CODE);
  });

  it('does not treat backticks INSIDE the code (e.g. template literals) as a fence', () => {
    const withTemplate =
      "export default function MotionGraphic() {\n  const x = `translateX(${0}px)`;\n  return null;\n}";
    expect(stripCodeFences(withTemplate)).toBe(withTemplate);
  });
});
