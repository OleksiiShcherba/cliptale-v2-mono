import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RenderProgressBar } from './RenderProgressBar';

// ---------------------------------------------------------------------------
// RenderProgressBar tests
// ---------------------------------------------------------------------------

describe('RenderProgressBar', () => {
  describe('rendering', () => {
    it('renders a progressbar role element', () => {
      render(<RenderProgressBar progressPct={50} />);
      expect(screen.getByRole('progressbar')).toBeTruthy();
    });

    it('sets aria-valuenow to the given progressPct', () => {
      render(<RenderProgressBar progressPct={65} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('65');
    });

    it('sets aria-valuemin to 0 and aria-valuemax to 100', () => {
      render(<RenderProgressBar progressPct={10} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('100');
    });

    it('uses a default aria-label when no label prop is provided', () => {
      render(<RenderProgressBar progressPct={30} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-label')).toBe('Render progress: 30%');
    });

    it('uses the provided label in aria-label', () => {
      render(<RenderProgressBar progressPct={80} label="Processing… 80%" />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-label')).toBe('Processing… 80%');
    });

    it('renders label text when label prop is provided', () => {
      render(<RenderProgressBar progressPct={45} label="Rendering… 45%" />);
      expect(screen.getByText('Rendering… 45%')).toBeTruthy();
    });

    it('does not render a label element when label prop is omitted', () => {
      const { container } = render(<RenderProgressBar progressPct={20} />);
      const p = container.querySelector('p');
      expect(p).toBeNull();
    });
  });

  describe('clamping', () => {
    it('clamps progressPct below 0 to 0', () => {
      render(<RenderProgressBar progressPct={-10} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('0');
    });

    it('clamps progressPct above 100 to 100', () => {
      render(<RenderProgressBar progressPct={150} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('100');
    });

    it('accepts 0 as a valid value', () => {
      render(<RenderProgressBar progressPct={0} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('0');
    });

    it('accepts 100 as a valid value', () => {
      render(<RenderProgressBar progressPct={100} />);
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('100');
    });
  });

  describe('fill width', () => {
    it('applies the correct width style to the fill element based on progressPct', () => {
      const { container } = render(<RenderProgressBar progressPct={72} />);
      const track = screen.getByRole('progressbar');
      const fill = track.firstChild as HTMLElement;
      expect(fill.style.width).toBe('72%');
    });

    it('renders fill with 0% width when progressPct is 0', () => {
      const { container } = render(<RenderProgressBar progressPct={0} />);
      const track = screen.getByRole('progressbar');
      const fill = track.firstChild as HTMLElement;
      expect(fill.style.width).toBe('0%');
    });

    it('renders fill with 100% width when progressPct is 100', () => {
      const { container } = render(<RenderProgressBar progressPct={100} />);
      const track = screen.getByRole('progressbar');
      const fill = track.firstChild as HTMLElement;
      expect(fill.style.width).toBe('100%');
    });
  });
});
