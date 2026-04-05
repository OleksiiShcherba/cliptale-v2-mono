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
 * Fetches GET /assets/:id/captions once on mount to detect existing captions,
 * then polls every 3 seconds only when `pollingEnabled` is true (i.e. after
 * the user has triggered transcription).
 *
 * Status derivation:
 * - `ready`  — API returned 200 with segments.
 * - `error`  — API returned a non-404 error.
 * - `idle`   — API returned 404 (no captions yet).
 *
 * Pass `null` for `assetId` to disable the query entirely.
 * Pass `pollingEnabled = true` to start the 3-second poll loop.
 */
export function useTranscriptionStatus(
  assetId: string | null,
  pollingEnabled = false,
): UseTranscriptionStatusResult {
  const { data, isError, isFetching } = useQuery({
    queryKey: ['captions', assetId],
    queryFn: () => getCaptions(assetId!),
    enabled: assetId !== null,
    // Poll only when the caller has started transcription; otherwise one-shot.
    refetchInterval: (query) => {
      if (!pollingEnabled) return false;
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
