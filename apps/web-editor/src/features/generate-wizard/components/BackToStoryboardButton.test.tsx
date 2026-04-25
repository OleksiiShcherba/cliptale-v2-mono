import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { BackToStoryboardButton } from './BackToStoryboardButton';

describe('BackToStoryboardButton', () => {
  it('should render with correct aria-label', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Back to Storyboard' })).toBeTruthy();
  });

  it('should render with correct data-testid', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    expect(screen.getByTestId('back-to-storyboard')).toBeTruthy();
  });

  it('should call onClick when clicked', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Storyboard' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should call onClick on Enter key press', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to Storyboard' }), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should call onClick on Space key press', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to Storyboard' }), {
      key: ' ',
      code: 'Space',
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick on other key presses', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to Storyboard' }), {
      key: 'Escape',
      code: 'Escape',
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should render with type="button" to prevent form submission', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'Back to Storyboard' });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('should render the button label text', () => {
    const onClick = vi.fn();
    render(<BackToStoryboardButton onClick={onClick} />);
    expect(screen.getByText('Back to Storyboard')).toBeTruthy();
  });
});
