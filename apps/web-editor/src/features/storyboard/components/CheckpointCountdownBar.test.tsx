/**
 * Tests for CheckpointCountdownBar + CheckpointCaptureOverlay
 * (storyboard-autosave-checkpoints T11, AC-03 / AC-05 / AC-06 / AC-07 / AC-07b).
 *
 * Covers:
 * - Counting state renders a ticking mm:ss countdown (AC-03 / AC-06).
 * - Idle state shows "All saved" with an INACTIVE Save button (AC-05).
 * - Save button triggers the manual checkpoint (AC-07) and is disabled while a
 *   save is in flight (AC-07b).
 * - CheckpointCaptureOverlay renders only while capturing (AC-03 loader).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CheckpointCountdownBar } from './CheckpointCountdownBar';
import { CheckpointCaptureOverlay } from './CheckpointCaptureOverlay';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CheckpointCountdownBar — counting (AC-03 / AC-06)', () => {
  it('renders the remaining time as m:ss while counting', () => {
    render(
      <CheckpointCountdownBar
        idle={false}
        remainingMs={83_000}
        canSaveNow={true}
        inFlight={false}
        onSaveNow={vi.fn()}
      />,
    );
    expect(screen.getByText(/1:23/)).toBeTruthy();
  });

  it('updates the rendered time when remainingMs changes (ticking)', () => {
    const { rerender } = render(
      <CheckpointCountdownBar
        idle={false}
        remainingMs={60_000}
        canSaveNow={true}
        inFlight={false}
        onSaveNow={vi.fn()}
      />,
    );
    expect(screen.getByText(/1:00/)).toBeTruthy();

    rerender(
      <CheckpointCountdownBar
        idle={false}
        remainingMs={59_000}
        canSaveNow={true}
        inFlight={false}
        onSaveNow={vi.fn()}
      />,
    );
    expect(screen.getByText(/0:59/)).toBeTruthy();
  });
});

describe('CheckpointCountdownBar — idle (AC-05)', () => {
  it('shows the all-saved state and an inactive Save button', () => {
    render(
      <CheckpointCountdownBar
        idle={true}
        remainingMs={null}
        canSaveNow={false}
        inFlight={false}
        onSaveNow={vi.fn()}
      />,
    );
    expect(screen.getByText(/all saved/i)).toBeTruthy();
    const save = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});

describe('CheckpointCountdownBar — manual Save (AC-07 / AC-07b)', () => {
  it('clicking Save triggers the manual checkpoint', () => {
    const onSaveNow = vi.fn();
    render(
      <CheckpointCountdownBar
        idle={false}
        remainingMs={30_000}
        canSaveNow={true}
        inFlight={false}
        onSaveNow={onSaveNow}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSaveNow).toHaveBeenCalledTimes(1);
  });

  it('Save is disabled while a checkpoint is in flight', () => {
    const onSaveNow = vi.fn();
    render(
      <CheckpointCountdownBar
        idle={false}
        remainingMs={30_000}
        canSaveNow={false}
        inFlight={true}
        onSaveNow={onSaveNow}
      />,
    );
    const save = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSaveNow).not.toHaveBeenCalled();
  });
});

describe('CheckpointCaptureOverlay — loader during capture only (AC-03)', () => {
  it('renders a full-screen loader while capturing', () => {
    render(<CheckpointCaptureOverlay visible={true} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/saving checkpoint/i)).toBeTruthy();
  });

  it('renders nothing when not capturing', () => {
    render(<CheckpointCaptureOverlay visible={false} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
