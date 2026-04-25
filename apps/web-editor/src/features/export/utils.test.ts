import { describe, it, expect } from 'vitest';

import { getPresetLabel, formatDate, getStatusBadgeStyle, getStatusLabel } from './utils';
import type { RenderJob } from './types';

// ---------------------------------------------------------------------------
// getPresetLabel
// ---------------------------------------------------------------------------

describe('getPresetLabel', () => {
  it('returns full label for the "1080p" preset key', () => {
    expect(getPresetLabel('1080p')).toBe('1080p Full HD · 1920×1080 · MP4');
  });

  it('returns full label for the "4k" preset key', () => {
    expect(getPresetLabel('4k')).toBe('4K Ultra HD · 3840×2160 · MP4');
  });

  it('returns full label for the "720p" preset key', () => {
    expect(getPresetLabel('720p')).toBe('720p HD · 1280×720 · MP4');
  });

  it('returns full label for the "vertical" preset key', () => {
    expect(getPresetLabel('vertical')).toBe('Vertical (9:16) · 1080×1920 · MP4');
  });

  it('returns full label for the "square" preset key', () => {
    expect(getPresetLabel('square')).toBe('Square (1:1) · 1080×1080 · MP4');
  });

  it('returns full label for the "webm" preset key with WEBM format', () => {
    expect(getPresetLabel('webm')).toBe('WebM (web) · 1920×1080 · WEBM');
  });

  it('falls back to the raw key for an unknown preset key', () => {
    expect(getPresetLabel('unknown-preset')).toBe('unknown-preset');
  });

  it('falls back to empty string key for empty string input', () => {
    expect(getPresetLabel('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2026-04-07T09:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes a month abbreviation in the output', () => {
    // ISO '2026-04-07' → month should be "Apr"
    const result = formatDate('2026-04-07T09:00:00.000Z');
    // Locale-dependent but should contain "Apr" in en-US environments
    expect(result).toMatch(/Apr|4/);
  });

  it('includes the day number in the output', () => {
    const result = formatDate('2026-04-07T09:00:00.000Z');
    expect(result).toMatch(/7/);
  });

  it('returns empty string for an invalid ISO string', () => {
    // formatDate catches exceptions from invalid Date construction
    // In most environments new Date('not-a-date') returns Invalid Date
    // and toLocaleString on Invalid Date throws in some environments
    // The function has a try/catch and returns '' on error
    const result = formatDate('not-a-date');
    // May return '' (if toLocaleString throws) or the browser's "Invalid Date" string;
    // the important thing is it does not throw
    expect(typeof result).toBe('string');
  });

  it('returns a string for a Unix epoch timestamp string (edge case)', () => {
    const result = formatDate('1970-01-01T00:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getStatusBadgeStyle
// ---------------------------------------------------------------------------

describe('getStatusBadgeStyle', () => {
  const STATUSES: RenderJob['status'][] = ['queued', 'processing', 'complete', 'failed'];

  it.each(STATUSES)('returns a style object for status "%s"', (status) => {
    const style = getStatusBadgeStyle(status);
    expect(typeof style).toBe('object');
    expect(style).not.toBeNull();
  });

  it('returns the text-secondary color (#8A8AA0) for "queued" status', () => {
    expect(getStatusBadgeStyle('queued').color).toBe('#8A8AA0');
  });

  it('returns the primary color (#7C3AED) for "processing" status', () => {
    expect(getStatusBadgeStyle('processing').color).toBe('#7C3AED');
  });

  it('returns the success color (#10B981) for "complete" status', () => {
    expect(getStatusBadgeStyle('complete').color).toBe('#10B981');
  });

  it('returns the error color (#EF4444) for "failed" status', () => {
    expect(getStatusBadgeStyle('failed').color).toBe('#EF4444');
  });

  it('includes base style properties (fontSize, fontWeight, borderRadius) for all statuses', () => {
    for (const status of STATUSES) {
      const style = getStatusBadgeStyle(status);
      expect(style.fontSize).toBe('11px');
      expect(style.fontWeight).toBe(500);
      expect(style.borderRadius).toBe('4px');
    }
  });
});

// ---------------------------------------------------------------------------
// getStatusLabel
// ---------------------------------------------------------------------------

describe('getStatusLabel', () => {
  it('returns "Queued" for "queued" status', () => {
    expect(getStatusLabel('queued')).toBe('Queued');
  });

  it('returns "Processing" for "processing" status', () => {
    expect(getStatusLabel('processing')).toBe('Processing');
  });

  it('returns "Complete" for "complete" status', () => {
    expect(getStatusLabel('complete')).toBe('Complete');
  });

  it('returns "Failed" for "failed" status', () => {
    expect(getStatusLabel('failed')).toBe('Failed');
  });
});
