import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CaptionEditorPanel } from './CaptionEditorPanel';

vi.mock('@/features/captions/hooks/useCaptionEditor', () => ({
  useCaptionEditor: vi.fn(),
}));

import * as useCaptionEditorModule from '@/features/captions/hooks/useCaptionEditor';

import { makeCaptionClip, makeCaptionHandlers } from './CaptionEditorPanel.fixtures';

const mockUseCaptionEditor = vi.mocked(useCaptionEditorModule.useCaptionEditor);

describe('CaptionEditorPanel — caption clip', () => {
  let captionHandlers: ReturnType<typeof makeCaptionHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    captionHandlers = makeCaptionHandlers();
    mockUseCaptionEditor.mockReturnValue(captionHandlers);
  });

  describe('rendering', () => {
    it('has "Caption editor" aria-label on the section', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('region', { name: 'Caption editor' })).toBeDefined();
    });

    it('does not render the text textarea for caption clips', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.queryByRole('textbox', { name: 'Caption text' })).toBeNull();
    });

    it('does not render the single color input for caption clips', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.queryByRole('textbox', { name: 'Text color (hex)' })).toBeNull();
    });

    it('renders the active word color input', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('textbox', { name: 'Active word color (hex)' })).toBeDefined();
    });

    it('renders the inactive word color input', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('textbox', { name: 'Inactive word color (hex)' })).toBeDefined();
    });

    it('renders the start frame input', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('spinbutton', { name: 'Start frame' })).toBeDefined();
    });

    it('renders the end frame input showing startFrame + durationFrames', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip({ startFrame: 10, durationFrames: 50 })} />);
      const input = screen.getByRole('spinbutton', { name: 'End frame' }) as HTMLInputElement;
      expect(input.value).toBe('60');
    });

    it('renders the font size input', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('spinbutton', { name: 'Font size' })).toBeDefined();
    });

    it('renders the position select', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      expect(screen.getByRole('combobox', { name: 'Vertical position' })).toBeDefined();
    });
  });

  describe('field values', () => {
    it('active word color input shows clip.activeColor', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip({ activeColor: '#FFDD00' })} />);
      const input = screen.getByRole('textbox', { name: 'Active word color (hex)' }) as HTMLInputElement;
      expect(input.value).toBe('#FFDD00');
    });

    it('inactive word color input shows clip.inactiveColor', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip({ inactiveColor: 'rgba(255,255,255,0.35)' })} />);
      const input = screen.getByRole('textbox', { name: 'Inactive word color (hex)' }) as HTMLInputElement;
      expect(input.value).toBe('rgba(255,255,255,0.35)');
    });
  });

  describe('field interactions', () => {
    it('changing start frame calls setStartFrame', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'Start frame' });
      fireEvent.change(input, { target: { value: '20' } });
      expect(captionHandlers.setStartFrame).toHaveBeenCalledWith(20);
    });

    it('changing end frame calls setEndFrame', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'End frame' });
      fireEvent.change(input, { target: { value: '90' } });
      expect(captionHandlers.setEndFrame).toHaveBeenCalledWith(90);
    });

    it('changing font size calls setFontSize', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'Font size' });
      fireEvent.change(input, { target: { value: '32' } });
      expect(captionHandlers.setFontSize).toHaveBeenCalledWith(32);
    });

    it('changing position calls setPosition', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const select = screen.getByRole('combobox', { name: 'Vertical position' });
      fireEvent.change(select, { target: { value: 'top' } });
      expect(captionHandlers.setPosition).toHaveBeenCalledWith('top');
    });

    it('changing active word color calls setActiveColor with new value', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const input = screen.getByRole('textbox', { name: 'Active word color (hex)' });
      fireEvent.change(input, { target: { value: '#FF0000' } });
      expect(captionHandlers.setActiveColor).toHaveBeenCalledWith('#FF0000');
    });

    it('changing inactive word color calls setInactiveColor with new value', () => {
      render(<CaptionEditorPanel clip={makeCaptionClip()} />);
      const input = screen.getByRole('textbox', { name: 'Inactive word color (hex)' });
      fireEvent.change(input, { target: { value: 'rgba(0,0,0,0.5)' } });
      expect(captionHandlers.setInactiveColor).toHaveBeenCalledWith('rgba(0,0,0,0.5)');
    });
  });
});
