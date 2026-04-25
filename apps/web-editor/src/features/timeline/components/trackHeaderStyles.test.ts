import { describe, it, expect } from 'vitest';

import { TRACK_ROW_HEIGHT, styles } from './trackHeaderStyles';

describe('trackHeaderStyles', () => {
  describe('TRACK_ROW_HEIGHT', () => {
    it('equals 36px (reduced from 48px to show more tracks without scrolling)', () => {
      expect(TRACK_ROW_HEIGHT).toBe(36);
    });
  });

  describe('styles.header', () => {
    it('uses TRACK_ROW_HEIGHT as the height so there is a single source of truth', () => {
      expect(styles.header.height).toBe(TRACK_ROW_HEIGHT);
    });

    it('height is 36px', () => {
      expect(styles.header.height).toBe(36);
    });
  });
});
