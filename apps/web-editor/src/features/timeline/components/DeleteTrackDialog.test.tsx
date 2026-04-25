import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Track } from '@ai-video-editor/project-schema';

import { DeleteTrackDialog } from './DeleteTrackDialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-001',
    type: 'video',
    name: 'Main Video',
    muted: false,
    locked: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeleteTrackDialog', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onConfirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onConfirm = vi.fn();
  });

  it('renders the dialog with correct title', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByRole('heading', { name: 'Delete Track' })).toBeDefined();
  });

  it('displays the track name in the warning message', () => {
    render(
      <DeleteTrackDialog track={makeTrack({ name: 'B-Roll' })} onClose={onClose} onConfirm={onConfirm} />,
    );
    expect(screen.getByText('B-Roll')).toBeDefined();
  });

  it('has role="dialog" and aria-modal="true"', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel delete/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close (X) button is clicked', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /close delete track dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay backdrop is clicked', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Delete Track' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onConfirm with track ID when Delete Track button is clicked', () => {
    const track = makeTrack({ id: 'track-xyz' });
    render(<DeleteTrackDialog track={track} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /delete track main video/i }));
    expect(onConfirm).toHaveBeenCalledWith('track-xyz');
  });

  it('does not call onClose when confirm is clicked', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /delete track main video/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows undo hint in warning text', () => {
    render(<DeleteTrackDialog track={makeTrack()} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByText(/ctrl\+z/i)).toBeDefined();
  });
});
