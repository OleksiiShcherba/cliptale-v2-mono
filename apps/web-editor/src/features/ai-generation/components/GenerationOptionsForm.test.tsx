import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { GenerationOptionsForm } from './GenerationOptionsForm';

describe('GenerationOptionsForm', () => {
  describe('image options', () => {
    it('renders size and style selects for image type', () => {
      render(
        <GenerationOptionsForm
          type="image"
          options={{ size: '1024x1024', style: 'vivid' }}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Size')).toBeTruthy();
      expect(screen.getByText('Style')).toBeTruthy();
    });

    it('calls onChange when size is changed', () => {
      const onChange = vi.fn();
      render(
        <GenerationOptionsForm
          type="image"
          options={{ size: '1024x1024', style: 'vivid' }}
          onChange={onChange}
        />,
      );
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[0], { target: { value: '1024x1792' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ size: '1024x1792' }),
      );
    });
  });

  describe('video options', () => {
    it('renders duration and aspect ratio selects for video type', () => {
      render(
        <GenerationOptionsForm
          type="video"
          options={{ duration: 5, aspectRatio: '16:9' }}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Duration')).toBeTruthy();
      expect(screen.getByText('Aspect Ratio')).toBeTruthy();
    });

    it('calls onChange when duration changes', () => {
      const onChange = vi.fn();
      render(
        <GenerationOptionsForm
          type="video"
          options={{ duration: 5, aspectRatio: '16:9' }}
          onChange={onChange}
        />,
      );
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[0], { target: { value: '10' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 10 }),
      );
    });
  });

  describe('audio options', () => {
    it('renders type select and duration slider for audio type', () => {
      render(
        <GenerationOptionsForm
          type="audio"
          options={{ type: 'music', duration: 10 }}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Type')).toBeTruthy();
      expect(screen.getByRole('slider')).toBeTruthy();
    });

    it('displays the current audio duration value', () => {
      render(
        <GenerationOptionsForm
          type="audio"
          options={{ type: 'music', duration: 30 }}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByText(/30s/)).toBeTruthy();
    });
  });

  describe('text type', () => {
    it('renders nothing for text type', () => {
      const { container } = render(
        <GenerationOptionsForm type="text" options={{}} onChange={vi.fn()} />,
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
