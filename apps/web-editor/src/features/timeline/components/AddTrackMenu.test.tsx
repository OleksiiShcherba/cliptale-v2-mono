import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AddTrackMenu } from './AddTrackMenu';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAddTrack = vi.fn();

vi.mock('../hooks/useAddEmptyTrack', () => ({
  useAddEmptyTrack: () => mockAddTrack,
  TRACK_TYPE_LABELS: {
    video: 'Video',
    audio: 'Audio',
    caption: 'Caption',
    overlay: 'Overlay',
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddTrackMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger button', () => {
    render(<AddTrackMenu />);
    expect(screen.getByRole('button', { name: /add track/i })).toBeDefined();
  });

  it('does not show the dropdown menu initially', () => {
    render(<AddTrackMenu />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the dropdown menu when the trigger button is clicked', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    expect(screen.getByRole('menu', { name: /select track type/i })).toBeDefined();
  });

  it('shows all four track type options when open', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    expect(screen.getByRole('menuitem', { name: 'Video' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Audio' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Caption' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Overlay' })).toBeDefined();
  });

  it('calls addTrack with "video" when Video option is clicked', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Video' }));
    expect(mockAddTrack).toHaveBeenCalledWith('video');
  });

  it('calls addTrack with "audio" when Audio option is clicked', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Audio' }));
    expect(mockAddTrack).toHaveBeenCalledWith('audio');
  });

  it('calls addTrack with "caption" when Caption option is clicked', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Caption' }));
    expect(mockAddTrack).toHaveBeenCalledWith('caption');
  });

  it('calls addTrack with "overlay" when Overlay option is clicked', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Overlay' }));
    expect(mockAddTrack).toHaveBeenCalledWith('overlay');
  });

  it('closes the menu after selecting a track type', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Audio' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu when Escape is pressed', () => {
    render(<AddTrackMenu />);
    fireEvent.click(screen.getByRole('button', { name: /add track/i }));
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('toggles the menu closed when the button is clicked again', () => {
    render(<AddTrackMenu />);
    const btn = screen.getByRole('button', { name: /add track/i });
    fireEvent.click(btn);
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('has aria-expanded=false when closed', () => {
    render(<AddTrackMenu />);
    const btn = screen.getByRole('button', { name: /add track/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('has aria-expanded=true when open', () => {
    render(<AddTrackMenu />);
    const btn = screen.getByRole('button', { name: /add track/i });
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
