import { useQuery } from '@tanstack/react-query';

import { getCaptions } from '@/features/captions/api';

import type { CaptionSegment, CaptionTrackStatus } from '@/features/captions/types';

/** Polling interval while transcription is in-progress (3 seconds). */
const POLL_INTERVAL_MS = 3_000;

export type UseTranscriptionStatusResult = {
  /** Current transcription lifecycle state. */
  status: CaptionTrackStatus;
  /** Transcript segments when status is `ready`; null otherwise. */
  segments: CaptionSegment[] | null;
  /** True while the React Query fetch is in-flight. */
  isFetching: boolean;
};

/**
 * Polls GET /assets/:id/captions every 3 seconds until the caption track is
 * available (`ready`) or an unexpected error occurs.
 *
 * Status derivation:
 * - `ready`  — API returned 200 with segments.
 * - `error`  — API returned a non-404 error.
 * - `idle`   — API returned 404 (not yet transcribed).
 *   Consumers that have called `triggerTranscription` should track their own
 *   `pending`/`processing` state on top of `idle`.
 *
 * Pass `null` for `assetId` to disable polling entirely.
 */
export function useTranscriptionStatus(
  assetId: string | null,
): UseTranscriptionStatusResult {
  const { data, isError, isFetching } = useQuery({
    queryKey: ['captions', assetId],
    queryFn: () => getCaptions(assetId!),
    enabled: assetId !== null,
    // Stop polling once we have segments (ready) or encounter a hard error.
    refetchInterval: (query) => {
      if (query.state.data != null) return false;
      if (query.state.error) return false;
      return POLL_INTERVAL_MS;
    },
    // A 404 is "not ready yet" — do not retry or treat it as an error.
    retry: false,
  });

  let status: CaptionTrackStatus;
  if (data != null) {
    status = 'ready';
  } else if (isError) {
    status = 'error';
  } else {
    status = 'idle';
  }

  return {
    status,
    segments: data?.segments ?? null,
    isFetching,
  };
}
