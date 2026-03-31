/**
 * Shared job payload types for BullMQ queues.
 * Imported by both the API (enqueue side) and the workers (consume side)
 * to avoid duplication across app boundaries.
 */

/** Payload for a `media-ingest` job — carries everything the worker needs to process an asset. */
export type MediaIngestJobPayload = {
  assetId: string;
  storageUri: string;
  contentType: string;
};
