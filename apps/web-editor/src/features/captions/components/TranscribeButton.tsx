import React, { useState, useCallback } from 'react';

import { triggerTranscription } from '@/features/captions/api';
import { useTranscriptionStatus } from '@/features/captions/hooks/useTranscriptionStatus';
import { useAddCaptionsToTimeline } from '@/features/captions/hooks/useAddCaptionsToTimeline';
import type { CaptionTrackStatus } from '@/features/captions/types';

export interface TranscribeButtonProps {
  assetId: string;
}

/** Extended button states (superset of CaptionTrackStatus). */
type ButtonState = CaptionTrackStatus | 'loading' | 'added';

const LABEL: Record<ButtonState, string> = {
  loading: 'Checking…',
  idle: 'Transcribe',
  pending: 'Transcribing…',
  processing: 'Transcribing…',
  ready: 'Add Captions to Timeline',
  error: 'Transcription failed — Retry',
  added: 'Captions Added',
};

const STATUS_COLOR: Record<ButtonState, string> = {
  loading: '#8A8AA0',
  idle: '#7C3AED',
  pending: '#8A8AA0',
  processing: '#8A8AA0',
  ready: '#10B981',
  error: '#EF4444',
  added: '#8A8AA0',
};

/**
 * Renders the transcription CTA for a single video/audio asset.
 *
 * State machine:
 * - loading    → initial fetch in-flight (isFetching=true and no prior trigger)
 * - idle       → GET /assets/:id/captions returned 404 or hook not yet resolved
 * - pending    → user clicked "Transcribe"; waiting for job to complete
 * - processing → same as pending (server returns processing status)
 * - ready      → captions exist; shows "Add Captions to Timeline"
 * - added      → user added captions to timeline; button disabled with confirmation
 * - error      → non-404 error from server; shows retry
 *
 * `useTranscriptionStatus` is enabled only after the user clicks "Transcribe" —
 * no caption polling happens on mount.
 */
export function TranscribeButton({ assetId }: TranscribeButtonProps): React.ReactElement {
  const [isTriggering, setIsTriggering] = useState(false);
  const [hasPendingTranscription, setHasPendingTranscription] = useState(false);
  const [captionsAdded, setCaptionsAdded] = useState(false);

  // Always fetch once on mount to detect existing captions.
  // Polling (3 s interval) only activates after the user triggers transcription.
  const { status: queryStatus, segments, isFetching } = useTranscriptionStatus(
    assetId,
    hasPendingTranscription,
  );
  const { addCaptionsToTimeline } = useAddCaptionsToTimeline();

  // Derive the effective button state.
  let effectiveState: ButtonState;

  if (captionsAdded) {
    effectiveState = 'added';
  } else if (hasPendingTranscription) {
    // User has triggered transcription — treat hook's idle as pending.
    effectiveState = queryStatus === 'idle' ? 'pending' : queryStatus;
  } else if (isFetching) {
    // Initial in-flight check — show neutral "Checking…" to avoid false "Transcribe".
    effectiveState = 'loading';
  } else {
    effectiveState = queryStatus;
  }

  const handleTranscribe = useCallback(async () => {
    if (isTriggering) return;
    setIsTriggering(true);
    try {
      await triggerTranscription(assetId);
      setHasPendingTranscription(true);
    } catch {
      // Trigger failed — stay in idle so user can retry.
    } finally {
      setIsTriggering(false);
    }
  }, [assetId, isTriggering]);

  const handleAddToTimeline = useCallback(() => {
    if (!segments) return;
    addCaptionsToTimeline(segments);
    setCaptionsAdded(true);
  }, [segments, addCaptionsToTimeline]);

  const handleRetry = useCallback(() => {
    setHasPendingTranscription(false);
  }, []);

  const isDisabled =
    captionsAdded ||
    isTriggering ||
    effectiveState === 'loading' ||
    effectiveState === 'pending' ||
    effectiveState === 'processing';

  const onClick =
    effectiveState === 'ready'
      ? handleAddToTimeline
      : effectiveState === 'error'
        ? handleRetry
        : handleTranscribe;

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={isDisabled}
      aria-label={LABEL[effectiveState]}
      aria-busy={effectiveState === 'loading' || effectiveState === 'pending' || effectiveState === 'processing'}
      style={{
        width: '100%',
        padding: '4px 8px',
        marginTop: 4,
        borderRadius: 4,
        border: 'none',
        backgroundColor: STATUS_COLOR[effectiveState],
        color: '#F0F0FA',
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        textAlign: 'center',
        opacity: isDisabled ? 0.7 : 1,
        transition: 'background-color 0.15s',
      }}
    >
      {LABEL[effectiveState]}
    </button>
  );
}
