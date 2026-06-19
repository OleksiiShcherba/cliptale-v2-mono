import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MotionGraphicsPage } from './MotionGraphicsPage';

describe('MotionGraphicsPage', () => {
  it('should mount and render the page heading', () => {
    render(<MotionGraphicsPage />);
    expect(screen.getByRole('heading', { name: /motion graphics/i })).toBeTruthy();
  });

  it('should render an empty-state placeholder', () => {
    render(<MotionGraphicsPage />);
    expect(screen.getByTestId('motion-graphics-empty')).toBeTruthy();
  });
});
