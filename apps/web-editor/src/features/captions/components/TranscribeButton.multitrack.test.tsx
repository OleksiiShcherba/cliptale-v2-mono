import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TranscribeButton } from './TranscribeButton';

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('@/features/captions/api', () => ({
  triggerTranscription: vi.fn(),
}));

vi.mock('@/features/captions/hooks/useTranscriptionStatus', () => ({
  useTranscriptionStatus: vi.fn(),
}));

vi.mock('@/features/captions/hooks/useAddCaptionsToTimeline', () => ({
  useAddCaptionsToTimeline: vi.fn(),
}));

import * as useTranscriptionStatusModule from '@/features/captions/hooks/useTranscriptionStatus';
import * as useAddCaptionsToTimelineModule from '@/features/captions/hooks/useAddCaptionsToTimeline';

import {
  TEST_SEGMENTS,
  makeReadyStatus,
  makeAddCaptionsHook,
} from './TranscribeButton.fixtures';

const mockUseTranscriptionStatus = vi.mocked(
  useTranscriptionStatusModule.useTranscriptionStatus,
);
const mockUseAddCaptionsToTimeline = vi.mocked(
  useAddCaptionsToTimelineModule.useAddCaptionsToTimeline,
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TranscribeButton / ready state (after transcription flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
  });

  it('renders "Add Captions to Timeline" label when ready (on mount, no click needed)', () => {
    render(<TranscribeButton fileId="asset-001" />);
    expect(
      screen.getByRole('button', { name: 'Add Captions to Timeline' }),
    ).toBeDefined();
  });

  it('calls addCaptionsToTimeline with segments when "Add Captions to Timeline" is clicked', () => {
    const addCaptionsToTimeline = vi.fn();
    mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

    render(<TranscribeButton fileId="asset-001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
    expect(addCaptionsToTimeline).toHaveBeenCalledWith(TEST_SEGMENTS);
  });
});

describe('TranscribeButton / adding captions to timeline (multiple tracks allowed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
  });

  it('button remains enabled after clicking "Add Captions to Timeline" to allow adding multiple tracks', () => {
    const addCaptionsToTimeline = vi.fn();
    mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

    render(<TranscribeButton fileId="asset-001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));

    // Button stays in "ready" state — not disabled — so user can add another track.
    const btn = screen.getByRole('button', { name: 'Add Captions to Timeline' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('can call addCaptionsToTimeline multiple times by clicking the button more than once', () => {
    const addCaptionsToTimeline = vi.fn();
    mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

    render(<TranscribeButton fileId="asset-001" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));

    expect(addCaptionsToTimeline).toHaveBeenCalledTimes(2);
  });
});
