import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MobileBottomBar } from './MobileBottomBar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar({
  onAddClip = vi.fn(),
  onAI = vi.fn(),
  canExport = true,
  onExport = vi.fn(),
} = {}) {
  return render(
    <MobileBottomBar
      onAddClip={onAddClip}
      onAI={onAI}
      canExport={canExport}
      onExport={onExport}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileBottomBar', () => {
  describe('rendering', () => {
    it('renders a nav element with label "Mobile editor toolbar"', () => {
      renderBar();
      expect(screen.getByRole('navigation', { name: 'Mobile editor toolbar' })).toBeTruthy();
    });

    it('renders an "Add clip" button', () => {
      renderBar();
      expect(screen.getByRole('button', { name: 'Add clip' })).toBeTruthy();
    });

    it('renders an "AI Captions" button', () => {
      renderBar();
      expect(screen.getByRole('button', { name: 'AI Captions' })).toBeTruthy();
    });

    it('renders an "Export video" button', () => {
      renderBar();
      expect(screen.getByRole('button', { name: 'Export video' })).toBeTruthy();
    });

    it('Export button has aria-disabled="false" when canExport is true', () => {
      renderBar({ canExport: true });
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('false');
    });

    it('Export button has aria-disabled="true" when canExport is false', () => {
      renderBar({ canExport: false });
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('aria-disabled')).toBe('true');
    });

    it('Export button shows tooltip when canExport is false', () => {
      renderBar({ canExport: false });
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('title')).toBe('Save your project first to export.');
    });

    it('Export button has no tooltip when canExport is true', () => {
      renderBar({ canExport: true });
      const exportBtn = screen.getByRole('button', { name: 'Export video' });
      expect(exportBtn.getAttribute('title')).toBeNull();
    });
  });

  describe('interaction', () => {
    it('calls onAddClip when Add clip button is clicked', () => {
      const onAddClip = vi.fn();
      renderBar({ onAddClip });
      fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
      expect(onAddClip).toHaveBeenCalledTimes(1);
    });

    it('calls onAI when AI Captions button is clicked', () => {
      const onAI = vi.fn();
      renderBar({ onAI });
      fireEvent.click(screen.getByRole('button', { name: 'AI Captions' }));
      expect(onAI).toHaveBeenCalledTimes(1);
    });

    it('calls onExport when Export button is clicked and canExport is true', () => {
      const onExport = vi.fn();
      renderBar({ canExport: true, onExport });
      fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onExport when Export button is clicked and canExport is false', () => {
      const onExport = vi.fn();
      renderBar({ canExport: false, onExport });
      fireEvent.click(screen.getByRole('button', { name: 'Export video' }));
      expect(onExport).not.toHaveBeenCalled();
    });
  });
});
