import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MobileInspectorTabs } from './MobileInspectorTabs';
import type { MobileTab } from './MobileInspectorTabs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTabs(activeTab: MobileTab = 'assets', onTabChange = vi.fn()) {
  return render(
    <MobileInspectorTabs activeTab={activeTab} onTabChange={onTabChange} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileInspectorTabs', () => {
  describe('rendering', () => {
    it('renders three tab buttons: Assets, Captions, Inspector', () => {
      renderTabs();
      expect(screen.getByRole('tab', { name: 'Assets' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Captions' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Inspector' })).toBeTruthy();
    });

    it('renders a nav element with accessible label "Mobile inspector tabs"', () => {
      renderTabs();
      expect(screen.getByRole('tablist', { name: 'Mobile inspector tabs' })).toBeTruthy();
    });

    it('marks the active tab with aria-selected="true"', () => {
      renderTabs('captions');
      const captionsTab = screen.getByRole('tab', { name: 'Captions' });
      expect(captionsTab.getAttribute('aria-selected')).toBe('true');
    });

    it('marks inactive tabs with aria-selected="false"', () => {
      renderTabs('captions');
      expect(screen.getByRole('tab', { name: 'Assets' }).getAttribute('aria-selected')).toBe('false');
      expect(screen.getByRole('tab', { name: 'Inspector' }).getAttribute('aria-selected')).toBe('false');
    });

    it('sets aria-selected="true" on "assets" tab when activeTab is assets', () => {
      renderTabs('assets');
      expect(screen.getByRole('tab', { name: 'Assets' }).getAttribute('aria-selected')).toBe('true');
    });

    it('sets aria-selected="true" on "inspector" tab when activeTab is inspector', () => {
      renderTabs('inspector');
      expect(screen.getByRole('tab', { name: 'Inspector' }).getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('interaction', () => {
    it('calls onTabChange with "assets" when Assets tab is clicked', () => {
      const onTabChange = vi.fn();
      renderTabs('captions', onTabChange);
      fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
      expect(onTabChange).toHaveBeenCalledWith('assets');
    });

    it('calls onTabChange with "captions" when Captions tab is clicked', () => {
      const onTabChange = vi.fn();
      renderTabs('assets', onTabChange);
      fireEvent.click(screen.getByRole('tab', { name: 'Captions' }));
      expect(onTabChange).toHaveBeenCalledWith('captions');
    });

    it('calls onTabChange with "inspector" when Inspector tab is clicked', () => {
      const onTabChange = vi.fn();
      renderTabs('assets', onTabChange);
      fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
      expect(onTabChange).toHaveBeenCalledWith('inspector');
    });

    it('calls onTabChange exactly once per click', () => {
      const onTabChange = vi.fn();
      renderTabs('assets', onTabChange);
      fireEvent.click(screen.getByRole('tab', { name: 'Captions' }));
      expect(onTabChange).toHaveBeenCalledTimes(1);
    });
  });
});
