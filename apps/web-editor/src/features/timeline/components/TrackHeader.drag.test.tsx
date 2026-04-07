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

describe('TrackHeader / drag handle', () => {
  it('renders a drag handle element', () => {
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Drag to reorder track')).toBeDefined();
  });

  it('calls onDragStart with track id when drag starts on the handle', () => {
    const onDragStart = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDragStart={onDragStart}
      />,
    );
    const handle = screen.getByLabelText('Drag to reorder track');
    fireEvent.dragStart(handle, {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });
    expect(onDragStart).toHaveBeenCalledWith('track-001');
  });

  it('calls onDragEnd when drag ends', () => {
    const onDragEnd = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDragEnd={onDragEnd}
      />,
    );
    const handle = screen.getByLabelText('Drag to reorder track');
    fireEvent.dragEnd(handle);
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it('calls onDragOver when a dragged track enters this header', () => {
    const onDragOver = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDragOver={onDragOver}
      />,
    );
    const header = screen.getByLabelText('Track: Video Track 1');
    fireEvent.dragOver(header, {
      dataTransfer: { types: ['application/cliptale-track'], dropEffect: '' },
    });
    expect(onDragOver).toHaveBeenCalledWith('track-001');
  });

  it('does not call onDragOver for non-track drag types', () => {
    const onDragOver = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDragOver={onDragOver}
      />,
    );
    const header = screen.getByLabelText('Track: Video Track 1');
    fireEvent.dragOver(header, {
      dataTransfer: { types: ['text/plain'], dropEffect: '' },
    });
    expect(onDragOver).not.toHaveBeenCalled();
  });

  it('calls onDrop when a dragged track is dropped onto this header', () => {
    const onDrop = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDrop={onDrop}
      />,
    );
    const header = screen.getByLabelText('Track: Video Track 1');
    fireEvent.drop(header, {
      dataTransfer: { types: ['application/cliptale-track'] },
    });
    expect(onDrop).toHaveBeenCalledWith('track-001');
  });

  it('does not call onDrop for non-track drag types', () => {
    const onDrop = vi.fn();
    render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        onDrop={onDrop}
      />,
    );
    const header = screen.getByLabelText('Track: Video Track 1');
    fireEvent.drop(header, {
      dataTransfer: { types: ['text/plain'] },
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('renders with reduced opacity when isDragging is true', () => {
    const { container } = render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        isDragging
      />,
    );
    const header = container.firstChild as HTMLElement;
    expect(header.style.opacity).toBe('0.5');
  });

  it('does not apply dragging opacity when isDragging is false', () => {
    const { container } = render(
      <TrackHeader
        track={baseTrack}
        onRename={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleLock={vi.fn()}
        isDragging={false}
      />,
    );
    const header = container.firstChild as HTMLElement;
    expect(header.style.opacity).not.toBe('0.5');
  });
});
