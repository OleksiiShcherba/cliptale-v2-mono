/**
 * Tests for GenerateRoadMapPlaceholder — the /generate/road-map placeholder page.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { GenerateRoadMapPlaceholder } from './GenerateRoadMapPlaceholder';

function renderPage() {
  return render(
    <MemoryRouter>
      <GenerateRoadMapPlaceholder />
    </MemoryRouter>,
  );
}

describe('GenerateRoadMapPlaceholder', () => {
  it('renders the "coming soon" heading and a back link to /generate', () => {
    renderPage();
    expect(screen.getByText(/step 2.*video road map/i)).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /back to step 1/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/generate');
  });
});
