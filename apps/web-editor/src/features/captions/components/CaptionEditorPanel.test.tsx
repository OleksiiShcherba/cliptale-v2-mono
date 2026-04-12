import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CaptionEditorPanel } from './CaptionEditorPanel';

vi.mock('@/features/captions/hooks/useCaptionEditor', () => ({
  useCaptionEditor: vi.fn(),
}));

import * as useCaptionEditorModule from '@/features/captions/hooks/useCaptionEditor';

import { makeClip, makeHandlers } from './CaptionEditorPanel.fixtures';

const mockUseCaptionEditor = vi.mocked(useCaptionEditorModule.useCaptionEditor);

describe('CaptionEditorPanel', () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockUseCaptionEditor.mockReturnValue(handlers);
  });

  describe('rendering', () => {
    it('has "Caption editor" aria-label on the section', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('region', { name: 'Caption editor' })).toBeDefined();
    });

    it('renders the text textarea', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('textbox', { name: 'Caption text' })).toBeDefined();
    });

    it('renders the start frame input', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('spinbutton', { name: 'Start frame' })).toBeDefined();
    });

    it('renders the end frame input', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('spinbutton', { name: 'End frame' })).toBeDefined();
    });

    it('renders the font size input', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('spinbutton', { name: 'Font size' })).toBeDefined();
    });

    it('renders the color input', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('textbox', { name: 'Text color (hex)' })).toBeDefined();
    });

    it('renders the position select', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.getByRole('combobox', { name: 'Vertical position' })).toBeDefined();
    });
  });

  describe('field values', () => {
    it('text textarea shows clip.text value', () => {
      render(<CaptionEditorPanel clip={makeClip({ text: 'My caption text' })} />);
      const textarea = screen.getByRole('textbox', { name: 'Caption text' }) as HTMLTextAreaElement;
      expect(textarea.value).toBe('My caption text');
    });

    it('start frame input shows clip.startFrame', () => {
      render(<CaptionEditorPanel clip={makeClip({ startFrame: 42 })} />);
      const input = screen.getByRole('spinbutton', { name: 'Start frame' }) as HTMLInputElement;
      expect(input.value).toBe('42');
    });

    it('end frame input shows computed value (startFrame + durationFrames)', () => {
      render(<CaptionEditorPanel clip={makeClip({ startFrame: 10, durationFrames: 50 })} />);
      const input = screen.getByRole('spinbutton', { name: 'End frame' }) as HTMLInputElement;
      expect(input.value).toBe('60');
    });

    it('font size input shows clip.fontSize', () => {
      render(<CaptionEditorPanel clip={makeClip({ fontSize: 36 })} />);
      const input = screen.getByRole('spinbutton', { name: 'Font size' }) as HTMLInputElement;
      expect(input.value).toBe('36');
    });

    it('color input shows clip.color', () => {
      render(<CaptionEditorPanel clip={makeClip({ color: '#7C3AED' })} />);
      const input = screen.getByRole('textbox', { name: 'Text color (hex)' }) as HTMLInputElement;
      expect(input.value).toBe('#7C3AED');
    });

    it('position select shows clip.position', () => {
      render(<CaptionEditorPanel clip={makeClip({ position: 'center' })} />);
      const select = screen.getByRole('combobox', { name: 'Vertical position' }) as HTMLSelectElement;
      expect(select.value).toBe('center');
    });
  });

  describe('field interactions', () => {
    it('changing text calls setText with new value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const textarea = screen.getByRole('textbox', { name: 'Caption text' });
      fireEvent.change(textarea, { target: { value: 'Updated caption' } });
      expect(handlers.setText).toHaveBeenCalledWith('Updated caption');
    });

    it('changing start frame calls setStartFrame with numeric value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'Start frame' });
      fireEvent.change(input, { target: { value: '25' } });
      expect(handlers.setStartFrame).toHaveBeenCalledWith(25);
    });

    it('changing end frame calls setEndFrame with numeric value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'End frame' });
      fireEvent.change(input, { target: { value: '80' } });
      expect(handlers.setEndFrame).toHaveBeenCalledWith(80);
    });

    it('changing font size calls setFontSize with numeric value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const input = screen.getByRole('spinbutton', { name: 'Font size' });
      fireEvent.change(input, { target: { value: '48' } });
      expect(handlers.setFontSize).toHaveBeenCalledWith(48);
    });

    it('changing color calls setColor with new value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const input = screen.getByRole('textbox', { name: 'Text color (hex)' });
      fireEvent.change(input, { target: { value: '#FF0000' } });
      expect(handlers.setColor).toHaveBeenCalledWith('#FF0000');
    });

    it('changing position calls setPosition with new value', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      const select = screen.getByRole('combobox', { name: 'Vertical position' });
      fireEvent.change(select, { target: { value: 'top' } });
      expect(handlers.setPosition).toHaveBeenCalledWith('top');
    });
  });

  describe('close button', () => {
    it('does not render a close button when onClose is not provided', () => {
      render(<CaptionEditorPanel clip={makeClip()} />);
      expect(screen.queryByRole('button', { name: /close caption editor/i })).toBeNull();
    });

    it('renders a close button when onClose is provided', () => {
      render(<CaptionEditorPanel clip={makeClip()} onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /close caption editor/i })).toBeDefined();
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<CaptionEditorPanel clip={makeClip()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /close caption editor/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
