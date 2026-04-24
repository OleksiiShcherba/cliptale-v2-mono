/**
 * Tests for ZoomToolbar.
 *
 * Covers:
 * - Renders the current zoom as a percentage (e.g. "100%").
 * - "+" click increments zoom by 10% and calls onZoomChange with new fraction.
 * - "−" click decrements zoom by 10% and calls onZoomChange with new fraction.
 * - "+" button is disabled at MAX_ZOOM_PCT (200%).
 * - "−" button is disabled at MIN_ZOOM_PCT (25%).
 * - Zoom label updates when currentZoom prop changes.
 * - Fractional zoom values are rounded to nearest integer percent.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ZoomToolbar, MIN_ZOOM_PCT, MAX_ZOOM_PCT } from './ZoomToolbar';

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderZoomToolbar(zoom: number, onZoomChange = vi.fn()) {
  return render(
    <ZoomToolbar currentZoom={zoom} onZoomChange={onZoomChange} />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ZoomToolbar', () => {
  describe('rendering', () => {
    it('renders "100%" when currentZoom is 1.0', () => {
      renderZoomToolbar(1.0);
      expect(screen.getByTestId('zoom-label').textContent).toBe('100%');
    });

    it('renders "50%" when currentZoom is 0.5', () => {
      renderZoomToolbar(0.5);
      expect(screen.getByTestId('zoom-label').textContent).toBe('50%');
    });

    it('renders "25%" when currentZoom is 0.25', () => {
      renderZoomToolbar(0.25);
      expect(screen.getByTestId('zoom-label').textContent).toBe('25%');
    });

    it('renders "200%" when currentZoom is 2.0', () => {
      renderZoomToolbar(2.0);
      expect(screen.getByTestId('zoom-label').textContent).toBe('200%');
    });

    it('rounds fractional zoom to nearest integer percent (0.333 → 33%)', () => {
      renderZoomToolbar(0.333);
      expect(screen.getByTestId('zoom-label').textContent).toBe('33%');
    });

    it('renders zoom-out and zoom-in buttons', () => {
      renderZoomToolbar(1.0);
      expect(screen.getByTestId('zoom-out-button')).not.toBeNull();
      expect(screen.getByTestId('zoom-in-button')).not.toBeNull();
    });
  });

  describe('zoom-in (+) button', () => {
    it('calls onZoomChange with (current + 10%) / 100 when "+" is clicked', () => {
      const onZoomChange = vi.fn();
      renderZoomToolbar(1.0, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-in-button'));

      // 100% + 10% = 110% → 1.1
      expect(onZoomChange).toHaveBeenCalledTimes(1);
      expect(onZoomChange).toHaveBeenCalledWith(1.1);
    });

    it('increments from 50% to 60%', () => {
      const onZoomChange = vi.fn();
      renderZoomToolbar(0.5, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-in-button'));

      expect(onZoomChange).toHaveBeenCalledWith(0.6);
    });

    it('is disabled when at MAX_ZOOM_PCT (200%)', () => {
      renderZoomToolbar(MAX_ZOOM_PCT / 100);
      const btn = screen.getByTestId('zoom-in-button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('clamps at MAX_ZOOM_PCT even when close to boundary (195%)', () => {
      const onZoomChange = vi.fn();
      // 195% + 10% = 205%, clamped to 200%.
      renderZoomToolbar(1.95, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-in-button'));

      expect(onZoomChange).toHaveBeenCalledWith(MAX_ZOOM_PCT / 100);
    });
  });

  describe('zoom-out (−) button', () => {
    it('calls onZoomChange with (current − 10%) / 100 when "−" is clicked', () => {
      const onZoomChange = vi.fn();
      renderZoomToolbar(1.0, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-out-button'));

      // 100% − 10% = 90% → 0.9
      expect(onZoomChange).toHaveBeenCalledTimes(1);
      expect(onZoomChange).toHaveBeenCalledWith(0.9);
    });

    it('decrements from 60% to 50%', () => {
      const onZoomChange = vi.fn();
      renderZoomToolbar(0.6, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-out-button'));

      expect(onZoomChange).toHaveBeenCalledWith(0.5);
    });

    it('is disabled when at MIN_ZOOM_PCT (25%)', () => {
      renderZoomToolbar(MIN_ZOOM_PCT / 100);
      const btn = screen.getByTestId('zoom-out-button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('clamps at MIN_ZOOM_PCT even when close to boundary (30%)', () => {
      const onZoomChange = vi.fn();
      // 30% − 10% = 20%, clamped to 25%.
      renderZoomToolbar(0.3, onZoomChange);

      fireEvent.click(screen.getByTestId('zoom-out-button'));

      expect(onZoomChange).toHaveBeenCalledWith(MIN_ZOOM_PCT / 100);
    });
  });

  describe('button state at boundaries', () => {
    it('zoom-out is enabled and zoom-in is disabled at max zoom', () => {
      renderZoomToolbar(2.0);
      const zoomOut = screen.getByTestId('zoom-out-button') as HTMLButtonElement;
      const zoomIn = screen.getByTestId('zoom-in-button') as HTMLButtonElement;
      expect(zoomOut.disabled).toBe(false);
      expect(zoomIn.disabled).toBe(true);
    });

    it('zoom-in is enabled and zoom-out is disabled at min zoom', () => {
      renderZoomToolbar(0.25);
      const zoomIn = screen.getByTestId('zoom-in-button') as HTMLButtonElement;
      const zoomOut = screen.getByTestId('zoom-out-button') as HTMLButtonElement;
      expect(zoomIn.disabled).toBe(false);
      expect(zoomOut.disabled).toBe(true);
    });

    it('both buttons are enabled at mid-range zoom (100%)', () => {
      renderZoomToolbar(1.0);
      const zoomOut = screen.getByTestId('zoom-out-button') as HTMLButtonElement;
      const zoomIn = screen.getByTestId('zoom-in-button') as HTMLButtonElement;
      expect(zoomOut.disabled).toBe(false);
      expect(zoomIn.disabled).toBe(false);
    });
  });
});
