import { describe, it, expect } from 'vitest';

import { formatTimecode } from './formatTimecode.js';

describe('formatTimecode', () => {
  it('formats frame 0 at 30fps as 00:00:00:00', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
  });

  it('formats frame 30 at 30fps as 00:00:01:00', () => {
    expect(formatTimecode(30, 30)).toBe('00:00:01:00');
  });

  it('formats frame 45 at 30fps as 00:00:01:15 (1s + 15 frames)', () => {
    expect(formatTimecode(45, 30)).toBe('00:00:01:15');
  });

  it('formats frame 1800 at 30fps as 00:01:00:00', () => {
    expect(formatTimecode(1800, 30)).toBe('00:01:00:00');
  });

  it('formats frame 108000 at 30fps as 01:00:00:00', () => {
    expect(formatTimecode(108000, 30)).toBe('01:00:00:00');
  });

  it('formats frame 29 at 30fps as 00:00:00:29', () => {
    expect(formatTimecode(29, 30)).toBe('00:00:00:29');
  });

  it('formats using provided fps (24fps)', () => {
    expect(formatTimecode(24, 24)).toBe('00:00:01:00');
  });

  it('pads single digits with leading zeros', () => {
    expect(formatTimecode(5, 30)).toBe('00:00:00:05');
  });
});
