/**
 * HomeSidebar — navigation tests.
 *
 * The sidebar carries the in-page Projects / Storyboard / Generate AI tabs. Each is
 * an in-page tab that swaps the right-hand panel (no route change) — Generate AI
 * behaves the same way as Projects and Storyboard.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { HomeSidebar } from './HomeSidebar';

describe('HomeSidebar — Generate AI tab', () => {
  it('renders a Generate AI tab alongside Projects / Storyboard', () => {
    render(<HomeSidebar activeTab="projects" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /projects/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /storyboard/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /generate ai/i })).toBeDefined();
  });

  it('calls onTabChange("generate-ai") when the Generate AI tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<HomeSidebar activeTab="projects" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /generate ai/i }));
    expect(onTabChange).toHaveBeenCalledWith('generate-ai');
  });

  it('marks the Generate AI tab active when it is the activeTab', () => {
    render(<HomeSidebar activeTab="generate-ai" onTabChange={vi.fn()} />);
    expect(
      screen.getByRole('tab', { name: /generate ai/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});
