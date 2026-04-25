import React from 'react';
import { render, screen } from '@testing-library/react';
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
  makeReadyStatus,
  makeErrorStatus,
  makePendingStatus,
  makeProcessingStatus,
  makeAddCaptionsHook,
} from './TranscribeButton.fixtures';

const mockUseTranscriptionStatus = vi.mocked(
  useTranscriptionStatusModule.useTranscriptionStatus,
);
const mockUseAddCaptionsToTimeline = vi.mocked(
  useAddCaptionsToTimelineModule.useAddCaptionsToTimeline,
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TranscribeButton / pending state on mount (job already queued when page loads)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makePendingStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
  });

  it('renders "Transcribing…" label when hook returns pending on mount', () => {
    render(<TranscribeButton fileId="asset-001" />);
    expect(screen.getByRole('button', { name: 'Transcribing…' })).toBeDefined();
  });

  it('button is disabled in pending state', () => {
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Transcribing…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('has aria-busy true in pending state', () => {
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Transcribing…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('TranscribeButton / processing state on mount (Whisper actively transcribing when page loads)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makeProcessingStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
  });

  it('renders "Transcribing…" label when hook returns processing on mount', () => {
    render(<TranscribeButton fileId="asset-001" />);
    expect(screen.getByRole('button', { name: 'Transcribing…' })).toBeDefined();
  });

  it('button is disabled in processing state', () => {
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Transcribing…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('has aria-busy true in processing state', () => {
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Transcribing…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('TranscribeButton / aria-busy is false in terminal states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
  });

  it('has aria-busy false in ready state', () => {
    mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Add Captions to Timeline' });
    expect(button.getAttribute('aria-busy')).toBe('false');
  });

  it('has aria-busy false in error state', () => {
    mockUseTranscriptionStatus.mockReturnValue(makeErrorStatus());
    render(<TranscribeButton fileId="asset-001" />);
    const button = screen.getByRole('button', { name: 'Transcription failed — Retry' });
    expect(button.getAttribute('aria-busy')).toBe('false');
  });
});
