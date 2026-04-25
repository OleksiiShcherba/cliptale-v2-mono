/**
 * Unit tests for the `getAssetDetailPanelStyles` style factory.
 * Locks in the compact vs fluid width branches (acceptance criteria §3).
 */
import { describe, it, expect } from 'vitest';

import { getAssetDetailPanelStyles } from './assetDetailPanel.styles';

describe('getAssetDetailPanelStyles', () => {
  // ---------------------------------------------------------------------------
  // compact = true (editor sidebar default)
  // ---------------------------------------------------------------------------

  describe('compact = true', () => {
    it('root.width is 280', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.root.width).toBe(280);
    });

    it('root has a fixed height of 620', () => {
      const s = getAssetDetailPanelStyles(true);
      expect((s.root as Record<string, unknown>).height).toBe(620);
    });

    it('root does not have maxWidth', () => {
      const s = getAssetDetailPanelStyles(true);
      expect((s.root as Record<string, unknown>).maxWidth).toBeUndefined();
    });

    it('previewContainer.width is 248', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.previewContainer.width).toBe(248);
    });

    it('previewContainer.maxWidth is undefined', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.previewContainer.maxWidth).toBeUndefined();
    });

    it('metadataRow.width is 248', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.metadataRow.width).toBe(248);
    });

    it('actionButton(true).width is 248', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.actionButton(true).width).toBe(248);
    });

    it('primaryActionButton(true).width is 248', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.primaryActionButton(true).width).toBe(248);
    });

    it('deleteButton(true).width is 248', () => {
      const s = getAssetDetailPanelStyles(true);
      expect(s.deleteButton(true).width).toBe(248);
    });
  });

  // ---------------------------------------------------------------------------
  // compact = false (wizard fluid layout)
  // ---------------------------------------------------------------------------

  describe('compact = false', () => {
    it('root.width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.root.width).toBe('100%');
    });

    it('root.maxWidth is 520', () => {
      const s = getAssetDetailPanelStyles(false);
      expect((s.root as Record<string, unknown>).maxWidth).toBe(520);
    });

    it('root does not have a fixed height', () => {
      const s = getAssetDetailPanelStyles(false);
      expect((s.root as Record<string, unknown>).height).toBeUndefined();
    });

    it('root has minHeight of 620', () => {
      const s = getAssetDetailPanelStyles(false);
      expect((s.root as Record<string, unknown>).minHeight).toBe(620);
    });

    it('previewContainer.width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.previewContainer.width).toBe('100%');
    });

    it('previewContainer.maxWidth is 480', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.previewContainer.maxWidth).toBe(480);
    });

    it('metadataRow.width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.metadataRow.width).toBe('100%');
    });

    it('metadataRow.maxWidth is 480', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.metadataRow.maxWidth).toBe(480);
    });

    it('actionButton(true).width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.actionButton(true).width).toBe('100%');
    });

    it('actionButton(true).maxWidth is 480', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.actionButton(true).maxWidth).toBe(480);
    });

    it('primaryActionButton(true).width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.primaryActionButton(true).width).toBe('100%');
    });

    it('deleteButton(false).width is 100%', () => {
      const s = getAssetDetailPanelStyles(false);
      expect(s.deleteButton(false).width).toBe('100%');
    });
  });
});
