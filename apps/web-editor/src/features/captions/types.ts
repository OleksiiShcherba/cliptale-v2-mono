/** A single Whisper transcript segment with timing and text. */
export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
};

/**
 * Transcription lifecycle state for an asset.
 * - `idle`       — no transcription requested yet.
 * - `pending`    — POST /transcribe called; job queued, not yet started.
 * - `processing` — Whisper is actively transcribing.
 * - `ready`      — caption track exists; segments available.
 * - `error`      — transcription failed.
 */
export type CaptionTrackStatus = 'idle' | 'pending' | 'processing' | 'ready' | 'error';
