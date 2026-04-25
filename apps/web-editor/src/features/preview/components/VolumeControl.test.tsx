import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VolumeControl } from './VolumeControl';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetVolume = vi.fn();
const mockSetMuted = vi.fn();
let mockVolume = 1;
let mockIsMuted = false;

vi.mock('@/store/ephemeral-store', () => ({
  useEphemeralStore: () => ({ volume: mockVolume, isMuted: mockIsMuted }),
  setVolume: (v: number) => mockSetVolume(v),
  setMuted: (m: boolean) => mockSetMuted(m),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VolumeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVolume = 1;
    mockIsMuted = false;
  });

  it('renders a mute button and a volume slider', () => {
    render(<VolumeControl />);
    expect(screen.getByRole('button', { name: /mute/i })).toBeDefined();
    expect(screen.getByRole('slider', { name: /volume/i })).toBeDefined();
  });

  it('shows "Mute" aria-label when not muted', () => {
    render(<VolumeControl />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Mute');
  });

  it('shows "Unmute" aria-label when muted', () => {
    mockIsMuted = true;
    render(<VolumeControl />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Unmute');
  });

  it('calls setMuted(true) when mute button is clicked and not muted', () => {
    render(<VolumeControl />);
    fireEvent.click(screen.getByRole('button', { name: /mute/i }));
    expect(mockSetMuted).toHaveBeenCalledWith(true);
  });

  it('calls setMuted(false) when mute button is clicked and muted', () => {
    mockIsMuted = true;
    render(<VolumeControl />);
    fireEvent.click(screen.getByRole('button', { name: /unmute/i }));
    expect(mockSetMuted).toHaveBeenCalledWith(false);
  });

  it('calls setVolume with the parsed slider value when slider changes', () => {
    render(<VolumeControl />);
    const slider = screen.getByRole('slider', { name: /volume/i });
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(mockSetVolume).toHaveBeenCalledWith(0.5);
  });

  it('slider value is 0 when muted', () => {
    mockIsMuted = true;
    mockVolume = 0.8;
    render(<VolumeControl />);
    const slider = screen.getByRole('slider', { name: /volume/i }) as HTMLInputElement;
    expect(slider.value).toBe('0');
  });

  it('slider value matches volume when not muted', () => {
    mockVolume = 0.7;
    render(<VolumeControl />);
    const slider = screen.getByRole('slider', { name: /volume/i }) as HTMLInputElement;
    expect(slider.value).toBe('0.7');
  });

  it('shows 100% label when volume is 1 and not muted', () => {
    render(<VolumeControl />);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('shows 0% label when muted', () => {
    mockIsMuted = true;
    render(<VolumeControl />);
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('shows 50% label when volume is 0.5', () => {
    mockVolume = 0.5;
    render(<VolumeControl />);
    expect(screen.getByText('50%')).toBeDefined();
  });
});
