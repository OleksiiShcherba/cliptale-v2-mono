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

// Partial router mock: the sidebar's Settings item navigates via useNavigate;
// the in-page tabs stay router-free, so existing tests keep rendering bare.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

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

describe('HomeSidebar — Settings menu item (storyboard-autosave-checkpoints T8, AC-09)', () => {
  it('renders a Settings item in the left menu', () => {
    render(<HomeSidebar activeTab="projects" onTabChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeDefined();
  });

  it('navigates to /settings when the Settings item is clicked', () => {
    mockNavigate.mockClear();
    render(<HomeSidebar activeTab="projects" onTabChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });
});
