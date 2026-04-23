/**
 * Tests for CanvasToolbar.
 *
 * Covers:
 * - The "Add Block" button renders with the correct label and aria-label.
 * - Clicking "Add Block" calls the onAddBlock callback exactly once.
 * - The "Auto-Arrange" button renders as disabled with title "Coming soon".
 * - The "Auto-Arrange" button does NOT invoke any callback when clicked.
 * - The toolbar container has data-testid="canvas-toolbar".
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CanvasToolbar } from './CanvasToolbar';

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderToolbar(onAddBlock = vi.fn()) {
  return render(<CanvasToolbar onAddBlock={onAddBlock} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CanvasToolbar', () => {
  describe('toolbar container', () => {
    it('renders a container with data-testid="canvas-toolbar"', () => {
      renderToolbar();
      expect(screen.getByTestId('canvas-toolbar')).not.toBeNull();
    });
  });

  describe('Add Block button', () => {
    it('renders with label text "Add Block"', () => {
      renderToolbar();
      const btn = screen.getByTestId('add-block-button');
      expect(btn.textContent).toContain('Add Block');
    });

    it('has aria-label "Add scene block"', () => {
      renderToolbar();
      const btn = screen.getByTestId('add-block-button');
      expect(btn.getAttribute('aria-label')).toBe('Add scene block');
    });

    it('is not disabled', () => {
      renderToolbar();
      const btn = screen.getByTestId('add-block-button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('calls onAddBlock exactly once when clicked', () => {
      const onAddBlock = vi.fn();
      renderToolbar(onAddBlock);

      fireEvent.click(screen.getByTestId('add-block-button'));

      expect(onAddBlock).toHaveBeenCalledTimes(1);
    });

    it('calls onAddBlock on each subsequent click', () => {
      const onAddBlock = vi.fn();
      renderToolbar(onAddBlock);

      fireEvent.click(screen.getByTestId('add-block-button'));
      fireEvent.click(screen.getByTestId('add-block-button'));
      fireEvent.click(screen.getByTestId('add-block-button'));

      expect(onAddBlock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Auto-Arrange button', () => {
    it('renders with label text "Auto-Arrange"', () => {
      renderToolbar();
      const btn = screen.getByTestId('auto-arrange-button');
      expect(btn.textContent).toContain('Auto-Arrange');
    });

    it('is disabled', () => {
      renderToolbar();
      const btn = screen.getByTestId('auto-arrange-button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('has title "Coming soon"', () => {
      renderToolbar();
      const btn = screen.getByTestId('auto-arrange-button');
      expect(btn.getAttribute('title')).toBe('Coming soon');
    });

    it('has aria-disabled="true"', () => {
      renderToolbar();
      const btn = screen.getByTestId('auto-arrange-button');
      expect(btn.getAttribute('aria-disabled')).toBe('true');
    });

    it('does not call onAddBlock when the Auto-Arrange button is clicked (disabled)', () => {
      const onAddBlock = vi.fn();
      renderToolbar(onAddBlock);

      // Disabled buttons do not fire click events in the browser, but fireEvent
      // does not enforce that; we verify by ensuring click on disabled button
      // does not trigger onAddBlock (which is unrelated to auto-arrange anyway).
      const btn = screen.getByTestId('auto-arrange-button');
      fireEvent.click(btn);

      expect(onAddBlock).not.toHaveBeenCalled();
    });
  });
});
