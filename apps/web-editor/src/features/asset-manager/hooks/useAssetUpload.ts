import { useState, useCallback } from 'react';

import { requestUploadUrl, finalizeAsset } from '@/features/asset-manager/api';
import type { UploadEntry } from '@/features/asset-manager/types';

type UseAssetUploadOptions = {
  projectId: string;
  /** Called when an asset transitions to `done` (finalize submitted successfully). */
  onUploadComplete?: (assetId: string) => void;
};

export type UseAssetUploadResult = {
  entries: UploadEntry[];
  isUploading: boolean;
  uploadFiles: (files: FileList | File[]) => void;
  clearEntries: () => void;
};

/**
 * Wraps native XHR in a promise so upload-progress events fire correctly.
 * fetch() does not expose upload progress in browsers today.
 */
function uploadViaXhr(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Manages multi-file presigned-URL upload: request URL → XHR PUT → finalize.
 * Tracks per-file progress and status via `entries`.
 */
export function useAssetUpload({ projectId, onUploadComplete }: UseAssetUploadOptions): UseAssetUploadResult {
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const patchEntry = useCallback((assetId: string, patch: Partial<UploadEntry>) => {
    setEntries((prev) => prev.map((e) => (e.assetId === assetId ? { ...e, ...patch } : e)));
  }, []);

  const uploadSingle = useCallback(
    async (file: File) => {
      let assetId = '';
      try {
        const { assetId: id, uploadUrl, expiresAt } = await requestUploadUrl({
          projectId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        });
        assetId = id;

        setEntries((prev) => [
          ...prev,
          { file, assetId, uploadUrl, expiresAt, progress: 0, status: 'uploading' },
        ]);

        await uploadViaXhr(uploadUrl, file, (pct) => patchEntry(assetId, { progress: pct }));
        patchEntry(assetId, { progress: 100 });

        await finalizeAsset(assetId);
        patchEntry(assetId, { status: 'done' });
        onUploadComplete?.(assetId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        if (assetId) patchEntry(assetId, { status: 'error', error: message });
      }
    },
    [projectId, onUploadComplete, patchEntry],
  );

  const uploadFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((f) => void uploadSingle(f));
    },
    [uploadSingle],
  );

  const clearEntries = useCallback(() => setEntries([]), []);

  return {
    entries,
    isUploading: entries.some((e) => e.status === 'uploading'),
    uploadFiles,
    clearEntries,
  };
}
