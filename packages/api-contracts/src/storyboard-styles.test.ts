import { describe, it, expect } from 'vitest';

import { STORYBOARD_STYLES, type StoryboardStyle } from './storyboard-styles.js';

describe('STORYBOARD_STYLES catalog', () => {
  it('has at least 3 entries', () => {
    expect(STORYBOARD_STYLES.length).toBeGreaterThanOrEqual(3);
  });

  it('every entry has a non-empty id, label, description, and previewColor', () => {
    for (const style of STORYBOARD_STYLES) {
      expect(style.id, 'id').toBeTruthy();
      expect(style.label, 'label').toBeTruthy();
      expect(style.description, 'description').toBeTruthy();
      expect(style.previewColor, 'previewColor').toBeTruthy();
    }
  });

  it('every id is a kebab-case slug (no spaces, no uppercase)', () => {
    for (const style of STORYBOARD_STYLES) {
      expect(style.id, style.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('every previewColor is a valid hex string', () => {
    for (const style of STORYBOARD_STYLES) {
      expect(style.previewColor, style.id).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
    }
  });

  it('all ids are unique', () => {
    const ids = STORYBOARD_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('catalog contains cyberpunk, cinematic-glow, and film-noir entries', () => {
    const ids = STORYBOARD_STYLES.map((s) => s.id);
    expect(ids).toContain('cyberpunk');
    expect(ids).toContain('cinematic-glow');
    expect(ids).toContain('film-noir');
  });

  it('StoryboardStyle type is satisfied by every catalog entry (compile-time verified)', () => {
    // Assigning to an explicitly typed variable ensures TS validates the shape.
    const typed: readonly StoryboardStyle[] = STORYBOARD_STYLES;
    expect(typed.length).toBe(STORYBOARD_STYLES.length);
  });
});
