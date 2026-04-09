import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { GenerationTypeSelector } from './GenerationTypeSelector';

describe('GenerationTypeSelector', () => {
  it('renders three type buttons: Image, Video, Audio', () => {
    render(<GenerationTypeSelector selected="image" onSelect={vi.fn()} />);
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('Audio')).toBeTruthy();
  });

  it('marks the selected button with aria-pressed=true', () => {
    render(<GenerationTypeSelector selected="video" onSelect={vi.fn()} />);
    const videoBtn = screen.getByRole('button', { name: /generate video/i });
    expect(videoBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks unselected buttons with aria-pressed=false', () => {
    render(<GenerationTypeSelector selected="image" onSelect={vi.fn()} />);
    const videoBtn = screen.getByRole('button', { name: /generate video/i });
    expect(videoBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelect with the correct type when a button is clicked', () => {
    const onSelect = vi.fn();
    render(<GenerationTypeSelector selected="image" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Audio'));
    expect(onSelect).toHaveBeenCalledWith('audio');
  });

  it('provides accessible labels for each button', () => {
    render(<GenerationTypeSelector selected="image" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /generate image/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate video/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate audio/i })).toBeTruthy();
  });
});
