import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { Track } from '@ai-video-editor/project-schema';

import { TrackHeader } from './TrackHeader';

const baseTrack: Track = {
  id: 'track-001',
  type: 'video',
  name: 'Video Track 1',
  muted: false,
  locked: false,
};

describe('TrackHeader', () => {
  it('renders the track name', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.getByText('Video Track 1')).toBeDefined();
  });

  it('renders a Mute button and Lock button', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Mute track')).toBeDefined();
    expect(screen.getByLabelText('Lock track')).toBeDefined();
  });

  it('calls onToggleMute when mute button is clicked', () => {
    const onToggleMute = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={onToggleMute}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Mute track'));
    expect(onToggleMute).toHaveBeenCalledWith('track-001');
  });

  it('calls onToggleLock when lock button is clicked', () => {
    const onToggleLock = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={onToggleLock}
      />,
    );
    fireEvent.click(screen.getByLabelText('Lock track'));
    expect(onToggleLock).toHaveBeenCalledWith('track-001');
  });

  it('shows "Unmute track" label when track is muted', () => {
    render(
      <TrackHeader
        track={{ ...baseTrack, muted: true }}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Unmute track')).toBeDefined();
  });

  it('shows "Unlock track" label when track is locked', () => {
    render(
      <TrackHeader
        track={{ ...baseTrack, locked: true }}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Unlock track')).toBeDefined();
  });

  it('switches to edit mode when track name is clicked', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    const nameButton = screen.getByLabelText('Rename track: Video Track 1');
    fireEvent.click(nameButton);

    const input = screen.getByLabelText('Edit track name') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Video Track 1');
  });

  it('commits rename on Enter key', () => {
    const onRename = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={onRename}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Rename track: Video Track 1'));

    const input = screen.getByLabelText('Edit track name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('track-001', 'New Name');
  });

  it('cancels rename on Escape key and restores original name', () => {
    const onRename = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={onRename}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Rename track: Video Track 1'));

    const input = screen.getByLabelText('Edit track name');
    fireEvent.change(input, { target: { value: 'Cancelled Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    // Original name button should be visible again
    expect(screen.getByText('Video Track 1')).toBeDefined();
  });

  it('commits rename on blur', () => {
    const onRename = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={onRename}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Rename track: Video Track 1'));

    const input = screen.getByLabelText('Edit track name');
    fireEvent.change(input, { target: { value: 'Blur Name' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith('track-001', 'Blur Name');
  });

  it('does not call onRename when name is unchanged', () => {
    const onRename = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={onRename}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Rename track: Video Track 1'));

    const input = screen.getByLabelText('Edit track name');
    // Don't change the value
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
  });

  it('falls back to original name when empty string is submitted', () => {
    const onRename = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={onRename}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Rename track: Video Track 1'));

    const input = screen.getByLabelText('Edit track name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Empty string should fall back to original name — no rename call
    expect(onRename).not.toHaveBeenCalled();
  });

  it('does not render a delete button when onDelete is not provided', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Delete track')).toBeNull();
  });

  it('renders a delete button when onDelete is provided', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Delete track')).toBeDefined();
  });

  it('calls onDelete with the track id when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete track'));
    expect(onDelete).toHaveBeenCalledWith('track-001');
  });

});
