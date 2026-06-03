/**
 * HomeSidebar — navigation tests.
 *
 * The sidebar carries the in-page Projects / Storyboard tabs PLUS a route link to
 * the standalone Generate AI page (US-01 discoverability — the page is otherwise
 * reachable only by typing the URL).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

import { HomeSidebar } from './HomeSidebar';

function LocationProbe(): React.ReactElement {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HomeSidebar activeTab="projects" onTabChange={vi.fn()} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomeSidebar — Generate AI entry', () => {
  it('renders a Generate AI navigation item', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /generate ai/i })).toBeDefined();
  });

  it('navigates to /generate-ai when clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('link', { name: /generate ai/i }));
    expect(screen.getByTestId('location').textContent).toBe('/generate-ai');
  });

  it('keeps the Projects / Storyboard tabs intact', () => {
    renderSidebar();
    expect(screen.getByRole('tab', { name: /projects/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /storyboard/i })).toBeDefined();
  });
});
