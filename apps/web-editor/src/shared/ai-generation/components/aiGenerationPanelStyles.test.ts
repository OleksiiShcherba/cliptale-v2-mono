import { describe, it, expect } from 'vitest';

import { getPanelStyle, aiGenerationPanelStyles } from './aiGenerationPanelStyles';

describe('getPanelStyle', () => {
  describe('compact mode (editor left sidebar)', () => {
    it('returns fixed 320px width to prevent layout shift', () => {
      const style = getPanelStyle(true);
      expect(style.width).toBe('320px');
    });

    it('does not set maxWidth so the sidebar width is unaffected', () => {
      const style = getPanelStyle(true);
      expect(style.maxWidth).toBeUndefined();
    });

    it('retains the full-height flex column layout', () => {
      const style = getPanelStyle(true);
      expect(style.height).toBe('100%');
      expect(style.display).toBe('flex');
      expect(style.flexDirection).toBe('column');
    });
  });

  describe('fluid mode (wizard embedding, default)', () => {
    it('fills available horizontal space with width 100%', () => {
      const style = getPanelStyle(false);
      expect(style.width).toBe('100%');
    });

    it('caps the panel at 720px via maxWidth', () => {
      const style = getPanelStyle(false);
      expect(style.maxWidth).toBe('720px');
    });

    it('retains the full-height flex column layout', () => {
      const style = getPanelStyle(false);
      expect(style.height).toBe('100%');
      expect(style.display).toBe('flex');
      expect(style.flexDirection).toBe('column');
    });
  });
});

describe('aiGenerationPanelStyles', () => {
  it('panel default is fluid (compact=false) matching wizard embedding', () => {
    expect(aiGenerationPanelStyles.panel.width).toBe('100%');
    expect(aiGenerationPanelStyles.panel.maxWidth).toBe('720px');
  });
});
