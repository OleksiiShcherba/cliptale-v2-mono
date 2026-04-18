/** Status of an asset through its ingest lifecycle. */
export type AssetStatus = 'pending' | 'processing' | 'ready' | 'error';

/** Broad media type category used for browser panel tabs. */
export type AssetType = 'video' | 'audio' | 'image';

/** A media asset as returned by the API. */
export type Asset = {
  id: string;
  projectId: string;
  filename: string;
  /** User-provided display name. When null, fall back to `filename` for display. */
  displayName: string | null;
  contentType: string;
  /** Presigned HTTPS GET URL — never a raw s3:// URI. */
  downloadUrl: string;
  status: AssetStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  thumbnailUri: string | null;
  waveformPeaks: number[] | null;
  createdAt: string;
  updatedAt: string;
};

/** Payload for POST /assets/upload-url. */
export type UploadUrlRequest = {
  projectId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
};

/** Response from POST /assets/upload-url. */
export type UploadUrlResponse = {
  assetId: string;
  uploadUrl: string;
  /** ISO timestamp after which the presigned URL must be re-requested. */
  expiresAt: string;
};

/** Active tab filter in the asset browser panel. */
export type AssetFilterTab = 'all' | 'video' | 'audio' | 'image';

/**
 * Re-exported for backward compatibility.
 * @deprecated Import directly from `@/shared/file-upload/types`.
 */
export type { UploadEntry } from '@/shared/file-upload/types';
