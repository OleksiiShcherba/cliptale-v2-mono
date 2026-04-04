/** Preset keys that map to render configurations on the backend. */
export type RenderPresetKey = '1080p' | '4k' | '720p' | 'vertical' | 'square' | 'webm';

/** Human-readable metadata for a render preset used in the export modal UI. */
export type RenderPresetOption = {
  key: RenderPresetKey;
  label: string;
  resolution: string;
  fps: number;
  format: 'mp4' | 'webm';
};

/** Current status of a render job as returned by the API. */
export type RenderJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

/** Full render job record as returned by GET /renders/:jobId. */
export type RenderJob = {
  jobId: string;
  projectId: string;
  versionId: number;
  status: RenderJobStatus;
  progressPct: number;
  preset: {
    key: RenderPresetKey;
    width: number;
    height: number;
    fps: number;
    format: 'mp4' | 'webm';
    codec: string;
  };
  outputUri: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only present when status is 'complete'. */
  downloadUrl?: string;
};

/** Response body from POST /projects/:id/renders (202 Accepted). */
export type CreateRenderResponse = {
  jobId: string;
  status: 'queued';
};

/** Response body from GET /projects/:id/renders. */
export type ListRendersResponse = {
  renders: RenderJob[];
};

/** Available preset options shown in the export modal. */
export const RENDER_PRESET_OPTIONS: RenderPresetOption[] = [
  { key: '1080p', label: '1080p Full HD', resolution: '1920×1080', fps: 30, format: 'mp4' },
  { key: '4k', label: '4K Ultra HD', resolution: '3840×2160', fps: 30, format: 'mp4' },
  { key: '720p', label: '720p HD', resolution: '1280×720', fps: 30, format: 'mp4' },
  { key: 'vertical', label: 'Vertical (9:16)', resolution: '1080×1920', fps: 30, format: 'mp4' },
  { key: 'square', label: 'Square (1:1)', resolution: '1080×1080', fps: 30, format: 'mp4' },
  { key: 'webm', label: 'WebM (web)', resolution: '1920×1080', fps: 30, format: 'webm' },
];
