import { describe, it, expect } from 'vitest';
import { aiGenerationPanelStyles } from './aiGenerationPanelStyles';

describe('aiGenerationPanelStyles', () => {
  it('panel width matches AssetBrowserPanel width (320px) to prevent layout shift', () => {
    expect(aiGenerationPanelStyles.panel.width).toBe('320px');
  });
});
