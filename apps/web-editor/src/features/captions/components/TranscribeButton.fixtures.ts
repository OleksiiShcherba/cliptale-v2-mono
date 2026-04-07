import { vi } from 'vitest';

/** Stable caption segments used across all TranscribeButton test files. */
export const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'Second line' },
];

/** Hook returns status='idle' + isFetching=false — initial resolved state, no captions exist. */
export function makeIdleStatus() {
  return { status: 'idle' as const, segments: null, isFetching: false };
}

/** Hook returns status='ready' — captions exist and are ready to add to timeline. */
export function makeReadyStatus() {
  return { status: 'ready' as const, segments: TEST_SEGMENTS, isFetching: false };
}

/** Hook returns status='error' — transcription failed. */
export function makeErrorStatus() {
  return { status: 'error' as const, segments: null, isFetching: false };
}

/** Hook returns status='idle' + isFetching=true — renders as 'loading' effectiveState. */
export function makeFetchingStatus() {
  return { status: 'idle' as const, segments: null, isFetching: true };
}

/** Hook returns status='pending' — job queued but hasPendingTranscription not yet set (e.g. page reload mid-job). */
export function makePendingStatus() {
  return { status: 'pending' as const, segments: null, isFetching: false };
}

/** Hook returns status='processing' — Whisper is actively transcribing (e.g. page reload mid-job). */
export function makeProcessingStatus() {
  return { status: 'processing' as const, segments: null, isFetching: false };
}

/** Returns a fresh mock for the useAddCaptionsToTimeline hook. */
export function makeAddCaptionsHook() {
  return { addCaptionsToTimeline: vi.fn() };
}
