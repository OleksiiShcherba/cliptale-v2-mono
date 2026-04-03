import React, { useState, useCallback } from 'react';

import { triggerTranscription } from '@/features/captions/api';
import { useTranscriptionStatus } from '@/features/captions/hooks/useTranscriptionStatus';
import { useAddCaptionsToTimeline } from '@/features/captions/hooks/useAddCaptionsToTimeline';
import type { CaptionTrackStatus } from '@/features/captions/types';

export interface TranscribeButtonProps {
  assetId: string;
}

const LABEL: Record<CaptionTrackStatus, string> = {
  idle: 'Transcribe',
  pending: 'Transcribing…',
  processing: 'Transcribing…',
  ready: 'Add Captions to Timeline',
  error: 'Transcription failed — Retry',
};

const STATUS_COLOR: Record<CaptionTrackStatus, string> = {
  idle: '#7C3AED',
  pending: '#8A8AA0',
  processing: '#8A8AA0',
  ready: '#10B981',
  error: '#EF4444',
};

/**
 * Renders the transcription CTA for a single video/audio asset.
 *
 * State machine:
 * - idle    → user clicks "Transcribe" → POST /assets/:id/transcribe → pending
 * - pending → polling via useTranscriptionStatus every 3 s
 * - ready   → "Add Captions to Timeline" button shown
 * - error   → shows retry button (resets to idle on click)
 */
export function TranscribeButton({ assetId }: TranscribeButtonProps): React.ReactElement {
  const [isTriggering, setIsTriggering] = useState(false);
  const [hasPendingTranscription, setHasPendingTranscription] = useState(false);

  const { status: queryStatus, segments } = useTranscriptionStatus(
    hasPendingTranscription ? assetId : null,
  );
  const { addCaptionsToTimeline } = useAddCaptionsToTimeline();

  // Derive the effective status: if user triggered, show pending until query resolves.
  const effectiveStatus: CaptionTrackStatus = hasPendingTranscription
    ? queryStatus === 'idle'
      ? 'pending'
      : queryStatus
    : 'idle';

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
  }, [segments, addCaptionsToTimeline]);

  const handleRetry = useCallback(() => {
    setHasPendingTranscription(false);
  }, []);

  const isDisabled =
    isTriggering ||
    effectiveStatus === 'pending' ||
    effectiveStatus === 'processing';

  const onClick =
    effectiveStatus === 'ready'
      ? handleAddToTimeline
      : effectiveStatus === 'error'
        ? handleRetry
        : handleTranscribe;

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={isDisabled}
      aria-label={LABEL[effectiveStatus]}
      aria-busy={isDisabled}
      style={{
        width: '100%',
        padding: '4px 8px',
        marginTop: 4,
        borderRadius: 4,
        border: 'none',
        backgroundColor: isDisabled ? '#252535' : STATUS_COLOR[effectiveStatus],
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
      {LABEL[effectiveStatus]}
    </button>
  );
}
