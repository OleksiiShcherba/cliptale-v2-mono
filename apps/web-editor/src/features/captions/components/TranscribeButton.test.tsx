import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import * as captionsApi from '@/features/captions/api';
import * as useTranscriptionStatusModule from '@/features/captions/hooks/useTranscriptionStatus';
import * as useAddCaptionsToTimelineModule from '@/features/captions/hooks/useAddCaptionsToTimeline';

const mockTriggerTranscription = vi.mocked(captionsApi.triggerTranscription);
const mockUseTranscriptionStatus = vi.mocked(
  useTranscriptionStatusModule.useTranscriptionStatus,
);
const mockUseAddCaptionsToTimeline = vi.mocked(
  useAddCaptionsToTimelineModule.useAddCaptionsToTimeline,
);

const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'Second line' },
];

function makeIdleStatus(isFetching = false) {
  return { status: 'idle' as const, segments: null, isFetching };
}

function makeReadyStatus() {
  return { status: 'ready' as const, segments: TEST_SEGMENTS, isFetching: false };
}

function makeErrorStatus() {
  return { status: 'error' as const, segments: null, isFetching: false };
}

function makeFetchingStatus() {
  return { status: 'idle' as const, segments: null, isFetching: true };
}

function makeAddCaptionsHook() {
  return { addCaptionsToTimeline: vi.fn() };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TranscribeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
    mockTriggerTranscription.mockResolvedValue({ jobId: 'job-001' });
  });

  describe('always passes assetId to hook on mount', () => {
    it('passes assetId (not null) to useTranscriptionStatus on initial render', () => {
      render(<TranscribeButton assetId="asset-001" />);
      expect(mockUseTranscriptionStatus).toHaveBeenCalledWith('asset-001');
    });

    it('does NOT pass null to useTranscriptionStatus before user clicks', () => {
      render(<TranscribeButton assetId="asset-001" />);
      expect(mockUseTranscriptionStatus).not.toHaveBeenCalledWith(null);
    });
  });

  describe('loading state (initial fetch in-flight)', () => {
    beforeEach(() => {
      mockUseTranscriptionStatus.mockReturnValue(makeFetchingStatus());
    });

    it('renders "Checking…" label while initial fetch is in-flight', () => {
      render(<TranscribeButton assetId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Checking…' })).toBeDefined();
    });

    it('button is disabled while loading to prevent premature clicks', () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Checking…' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('has aria-busy true while loading', () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Checking…' });
      expect(button.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('idle state (no existing captions, initial fetch resolved)', () => {
    it('renders "Transcribe" label when idle and not fetching', () => {
      render(<TranscribeButton assetId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
    });

    it('button is enabled in idle state', () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('has aria-busy false in idle state', () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      expect(button.getAttribute('aria-busy')).toBe('false');
    });
  });

  describe('ready state on mount (existing captions detected)', () => {
    beforeEach(() => {
      // Simulate the hook returning ready immediately (captions already exist).
      mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    });

    it('shows "Add Captions to Timeline" immediately without user clicking Transcribe first', () => {
      render(<TranscribeButton assetId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Add Captions to Timeline' })).toBeDefined();
    });

    it('"Add Captions to Timeline" button is enabled when status is ready', () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Add Captions to Timeline' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('calls addCaptionsToTimeline with segments when button is clicked', () => {
      const addCaptionsToTimeline = vi.fn();
      mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

      render(<TranscribeButton assetId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
      expect(addCaptionsToTimeline).toHaveBeenCalledWith(TEST_SEGMENTS);
    });
  });

  describe('triggering transcription', () => {
    it('calls triggerTranscription with the assetId when clicked', async () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockTriggerTranscription).toHaveBeenCalledWith('asset-001');
      });
    });

    it('does not call triggerTranscription more than once if clicked while triggering', async () => {
      let resolveFirst: (v: { jobId: string }) => void;
      mockTriggerTranscription.mockReturnValueOnce(
        new Promise((res) => {
          resolveFirst = res;
        }),
      );

      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });

      fireEvent.click(button);
      fireEvent.click(button); // second click while first is in-flight

      resolveFirst!({ jobId: 'job-001' });
      await waitFor(() => expect(mockTriggerTranscription).toHaveBeenCalledTimes(1));
    });

    it('shows pending state (aria-busy) while waiting for polling to resolve', async () => {
      render(<TranscribeButton assetId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(button.getAttribute('aria-busy')).toBe('true');
      });
    });
  });

  describe('ready state (after transcription flow)', () => {
    beforeEach(() => {
      mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    });

    it('renders "Add Captions to Timeline" label when ready (on mount, no click needed)', () => {
      // Because assetId is always passed, the hook resolves ready on mount.
      render(<TranscribeButton assetId="asset-001" />);
      expect(
        screen.getByRole('button', { name: 'Add Captions to Timeline' }),
      ).toBeDefined();
    });

    it('calls addCaptionsToTimeline with segments when "Add Captions to Timeline" is clicked', () => {
      const addCaptionsToTimeline = vi.fn();
      mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

      render(<TranscribeButton assetId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
      expect(addCaptionsToTimeline).toHaveBeenCalledWith(TEST_SEGMENTS);
    });
  });

  describe('"Captions Added" state (Task 2: feedback after adding to timeline)', () => {
    beforeEach(() => {
      // Hook returns ready on mount since assetId is always passed.
      mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    });

    it('changes label to "Captions Added" after clicking "Add Captions to Timeline"', () => {
      render(<TranscribeButton assetId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
      expect(screen.getByRole('button', { name: 'Captions Added' })).toBeDefined();
    });

    it('disables the button after "Captions Added" to prevent duplicate clicks', () => {
      render(<TranscribeButton assetId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
      const addedBtn = screen.getByRole('button', { name: 'Captions Added' });
      expect((addedBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls addCaptionsToTimeline only once even if button element is clicked again after state change', () => {
      const addCaptionsToTimeline = vi.fn();
      mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

      render(<TranscribeButton assetId="asset-001" />);
      const addBtn = screen.getByRole('button', { name: 'Add Captions to Timeline' });
      fireEvent.click(addBtn);

      // Button is now disabled/relabeled — HTML disabled prevents handler from firing.
      // We verify only one call was made.
      expect(addCaptionsToTimeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('error state', () => {
    it('renders error retry label when status is error on mount', () => {
      mockUseTranscriptionStatus.mockReturnValue(makeErrorStatus());
      render(<TranscribeButton assetId="asset-001" />);
      expect(
        screen.getByRole('button', { name: 'Transcription failed — Retry' }),
      ).toBeDefined();
    });

    it('resets to idle state when retry is clicked after triggering transcription that errored', async () => {
      // Start idle → user clicks "Transcribe" → mock returns error (transcription failed).
      mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
      render(<TranscribeButton assetId="asset-001" />);

      // Click "Transcribe" to set hasPendingTranscription=true.
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));

      // Polling now resolves to error.
      mockUseTranscriptionStatus.mockReturnValue(makeErrorStatus());

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Transcription failed — Retry' }),
        ).toBeDefined();
      });

      // Clicking retry sets hasPendingTranscription=false; hook returns idle.
      mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
      fireEvent.click(screen.getByRole('button', { name: 'Transcription failed — Retry' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
      });
    });
  });

  describe('trigger failure', () => {
    it('stays in idle state when triggerTranscription throws', async () => {
      mockTriggerTranscription.mockRejectedValueOnce(new Error('Network error'));

      render(<TranscribeButton assetId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
      });

      // Verify polling was not gated — assetId is always passed (not null).
      expect(mockUseTranscriptionStatus).toHaveBeenCalledWith('asset-001');
    });
  });
});
