import type { AudioClip, ImageClip, VideoClip } from '@ai-video-editor/project-schema';

import { buildAuthenticatedUrl } from '@/lib/api-client';

import type { Asset, AssetFilterTab } from './types';

/** Formats bytes to a human-readable string (B / KB / MB / GB). */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Formats duration in seconds to M:SS. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Returns a human-readable label for a MIME content type. */
export function getTypeLabel(contentType: string): string {
  if (contentType.startsWith('video/')) return 'Video';
  if (contentType.startsWith('audio/')) return 'Audio';
  if (contentType.startsWith('image/')) return 'Image';
  return 'File';
}

/**
 * Builds a typed clip object for the given asset content type.
 * Returns null for unsupported types.
 */
export function buildClipForAsset(
  contentType: string,
  assetId: string,
  trackId: string,
  startFrame: number,
  durationFrames: number,
): VideoClip | AudioClip | ImageClip | null {
  const id = crypto.randomUUID();
  if (contentType.startsWith('video/')) {
    return { id, type: 'video', assetId, trackId, startFrame, durationFrames, trimInFrame: 0, opacity: 1, volume: 1 };
  }
  if (contentType.startsWith('audio/')) {
    return { id, type: 'audio', assetId, trackId, startFrame, durationFrames, trimInFrame: 0, volume: 1 };
  }
  if (contentType.startsWith('image/')) {
    return { id, type: 'image', assetId, trackId, startFrame, durationFrames, opacity: 1 };
  }
  return null;
}

/**
 * Returns the best preview image URL for an asset.
 *
 * - Video assets: returns `thumbnailUri` (API-proxied JPEG thumbnail).
 * - Image assets: returns the asset stream URL (`/assets/:id/stream`) so the
 *   browser can display the actual image even when no separate thumbnail exists.
 * - Audio / unknown: returns null (no visual preview).
 *
 * @param asset       The asset record from the API.
 * @param apiBaseUrl  The API base URL (e.g. "http://localhost:3001") used to
 *                    build the stream endpoint URL.
 */
export function getAssetPreviewUrl(asset: Asset, apiBaseUrl: string): string | null {
  if (asset.thumbnailUri) return buildAuthenticatedUrl(asset.thumbnailUri);
  if (asset.contentType.startsWith('image/') && asset.status === 'ready') {
    return buildAuthenticatedUrl(`${apiBaseUrl}/assets/${asset.id}/stream`);
  }
  return null;
}

/**
 * Computes the duration in frames for an asset drop.
 * Falls back to `fps * 5` when the asset has no duration (images).
 */
export function computeClipDurationFrames(durationSeconds: number | null, fps: number): number {
  if (durationSeconds != null && durationSeconds > 0) {
    return Math.max(1, Math.round(durationSeconds * fps));
  }
  return fps * 5;
}

/**
 * Returns a human-readable track type label for a given asset MIME type.
 * Used in the "Add to Timeline" dropdown to label the target track type.
 */
export function trackTypeLabel(contentType: string): string {
  if (contentType.startsWith('audio/')) return 'Audio';
  return 'Video'; // video/* and image/* both target video tracks
}

/**
 * Returns true when the given asset belongs to the active filter tab.
 * `'all'` always returns true.
 */
export function matchesTab(asset: Asset, tab: AssetFilterTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'video') return asset.contentType.startsWith('video/');
  if (tab === 'audio') return asset.contentType.startsWith('audio/');
  if (tab === 'image') return asset.contentType.startsWith('image/');
  return false;
}
