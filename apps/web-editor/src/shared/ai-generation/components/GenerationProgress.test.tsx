import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GenerationProgress } from './GenerationProgress';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    status: 'processing' as const,
    progress: 50,
    resultAssetId: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('GenerationProgress', () => {
  it('renders a progressbar with correct aria attributes', () => {
    render(<GenerationProgress job={makeJob({ progress: 65 })} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('65');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('shows "Processing..." label with percentage', () => {
    render(<GenerationProgress job={makeJob({ progress: 42 })} />);
    expect(screen.getByText('Processing... 42%')).toBeTruthy();
  });

  it('shows "Queued" label for queued status', () => {
    render(<GenerationProgress job={makeJob({ status: 'queued', progress: 0 })} />);
    expect(screen.getByText(/queued/i)).toBeTruthy();
  });

  it('clamps progress below 0 to 0', () => {
    render(<GenerationProgress job={makeJob({ progress: -10 })} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });

  it('clamps progress above 100 to 100', () => {
    render(<GenerationProgress job={makeJob({ progress: 150 })} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('applies correct width style to the fill element', () => {
    render(<GenerationProgress job={makeJob({ progress: 72 })} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstChild as HTMLElement;
    expect(fill.style.width).toBe('72%');
  });

  it('provides an accessible label with the progress percentage', () => {
    render(<GenerationProgress job={makeJob({ progress: 88 })} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Generation progress: 88%');
  });
});
