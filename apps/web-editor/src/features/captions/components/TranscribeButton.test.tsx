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

import {
  TEST_SEGMENTS,
  makeIdleStatus,
  makeReadyStatus,
  makeErrorStatus,
  makeFetchingStatus,
  makeAddCaptionsHook,
} from './TranscribeButton.fixtures';

const mockTriggerTranscription = vi.mocked(captionsApi.triggerTranscription);
const mockUseTranscriptionStatus = vi.mocked(
  useTranscriptionStatusModule.useTranscriptionStatus,
);
const mockUseAddCaptionsToTimeline = vi.mocked(
  useAddCaptionsToTimelineModule.useAddCaptionsToTimeline,
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TranscribeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
    mockUseAddCaptionsToTimeline.mockReturnValue(makeAddCaptionsHook());
    mockTriggerTranscription.mockResolvedValue({ jobId: 'job-001' });
  });

  describe('always passes fileId to hook on mount', () => {
    it('passes fileId and pollingEnabled=false to useTranscriptionStatus on initial render', () => {
      render(<TranscribeButton fileId="asset-001" />);
      expect(mockUseTranscriptionStatus).toHaveBeenCalledWith('asset-001', false);
    });

    it('does NOT pass null as fileId to useTranscriptionStatus before user clicks', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const calls = mockUseTranscriptionStatus.mock.calls;
      expect(calls.every(([fileId]) => fileId === 'asset-001')).toBe(true);
    });
  });

  describe('loading state (initial fetch in-flight)', () => {
    beforeEach(() => {
      mockUseTranscriptionStatus.mockReturnValue(makeFetchingStatus());
    });

    it('renders "Checking…" label while initial fetch is in-flight', () => {
      render(<TranscribeButton fileId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Checking…' })).toBeDefined();
    });

    it('button is disabled while loading to prevent premature clicks', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Checking…' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('has aria-busy true while loading', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Checking…' });
      expect(button.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('idle state (no existing captions, initial fetch resolved)', () => {
    it('renders "Transcribe" label when idle and not fetching', () => {
      render(<TranscribeButton fileId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
    });

    it('button is enabled in idle state', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('has aria-busy false in idle state', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      expect(button.getAttribute('aria-busy')).toBe('false');
    });
  });

  describe('ready state on mount (existing captions detected)', () => {
    beforeEach(() => {
      mockUseTranscriptionStatus.mockReturnValue(makeReadyStatus());
    });

    it('shows "Add Captions to Timeline" immediately without user clicking Transcribe first', () => {
      render(<TranscribeButton fileId="asset-001" />);
      expect(screen.getByRole('button', { name: 'Add Captions to Timeline' })).toBeDefined();
    });

    it('"Add Captions to Timeline" button is enabled when status is ready', () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Add Captions to Timeline' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('calls addCaptionsToTimeline with segments when button is clicked', () => {
      const addCaptionsToTimeline = vi.fn();
      mockUseAddCaptionsToTimeline.mockReturnValue({ addCaptionsToTimeline });

      render(<TranscribeButton fileId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Add Captions to Timeline' }));
      expect(addCaptionsToTimeline).toHaveBeenCalledWith(TEST_SEGMENTS);
    });
  });

  describe('triggering transcription', () => {
    it('calls triggerTranscription with the fileId when clicked', async () => {
      render(<TranscribeButton fileId="asset-001" />);
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

      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });

      fireEvent.click(button);
      fireEvent.click(button); // second click while first is in-flight

      resolveFirst!({ jobId: 'job-001' });
      await waitFor(() => expect(mockTriggerTranscription).toHaveBeenCalledTimes(1));
    });

    it('shows pending state (aria-busy) while waiting for polling to resolve', async () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(button.getAttribute('aria-busy')).toBe('true');
      });
    });
  });

  describe('error state', () => {
    it('renders error retry label when status is error on mount', () => {
      mockUseTranscriptionStatus.mockReturnValue(makeErrorStatus());
      render(<TranscribeButton fileId="asset-001" />);
      expect(
        screen.getByRole('button', { name: 'Transcription failed — Retry' }),
      ).toBeDefined();
    });

    it('resets to idle state when retry is clicked after triggering transcription that errored', async () => {
      mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
      render(<TranscribeButton fileId="asset-001" />);

      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));

      mockUseTranscriptionStatus.mockReturnValue(makeErrorStatus());

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Transcription failed — Retry' }),
        ).toBeDefined();
      });

      mockUseTranscriptionStatus.mockReturnValue(makeIdleStatus());
      fireEvent.click(screen.getByRole('button', { name: 'Transcription failed — Retry' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
      });
    });
  });

  describe('pollingEnabled flag threading', () => {
    it('passes pollingEnabled=true to useTranscriptionStatus after user triggers transcription', async () => {
      render(<TranscribeButton fileId="asset-001" />);
      const button = screen.getByRole('button', { name: 'Transcribe' });
      fireEvent.click(button);

      await waitFor(() => {
        const calls = mockUseTranscriptionStatus.mock.calls;
        const hasPollingCall = calls.some(([, pollingEnabled]) => pollingEnabled === true);
        expect(hasPollingCall).toBe(true);
      });
    });

    it('passes pollingEnabled=false to useTranscriptionStatus before user triggers transcription', () => {
      render(<TranscribeButton fileId="asset-001" />);
      expect(mockUseTranscriptionStatus).toHaveBeenLastCalledWith('asset-001', false);
    });
  });

  describe('trigger failure', () => {
    it('stays in idle state when triggerTranscription throws', async () => {
      mockTriggerTranscription.mockRejectedValueOnce(new Error('Network error'));

      render(<TranscribeButton fileId="asset-001" />);
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDefined();
      });

      expect(mockUseTranscriptionStatus).toHaveBeenCalledWith('asset-001', false);
    });
  });

});
