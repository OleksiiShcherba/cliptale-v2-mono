import { useState, useCallback } from 'react';

import {
  requestUploadUrl,
  finalizeFile,
  linkFileToProject,
  linkFileToDraft,
} from '@/shared/file-upload/api';
import type { UploadEntry, UploadTarget } from '@/shared/file-upload/types';

type UseFileUploadOptions = {
  target: UploadTarget;
  /** Called when a file transitions to `done` (finalize + link submitted successfully). */
  onUploadComplete?: (fileId: string) => void;
};

export type UseFileUploadResult = {
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
 * Calls the appropriate link endpoint based on the upload target.
 * Project target → POST /projects/:id/files.
 * Draft target   → POST /generation-drafts/:id/files.
 */
async function linkFile(target: UploadTarget, fileId: string): Promise<void> {
  if (target.kind === 'project') {
    await linkFileToProject(target.projectId, fileId);
  } else {
    await linkFileToDraft(target.draftId, fileId);
  }
}

/**
 * Context-aware multi-file presigned-URL upload hook.
 *
 * Flow: POST /files/upload-url → XHR PUT to S3 → POST /files/:id/finalize
 *       → POST /projects/:id/files  (target.kind === 'project')
 *       → POST /generation-drafts/:id/files  (target.kind === 'draft')
 *
 * Tracks per-file progress and status via `entries`.
 */
export function useFileUpload({ target, onUploadComplete }: UseFileUploadOptions): UseFileUploadResult {
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const patchEntry = useCallback((fileId: string, patch: Partial<UploadEntry>) => {
    setEntries((prev) => prev.map((e) => (e.fileId === fileId ? { ...e, ...patch } : e)));
  }, []);

  const uploadSingle = useCallback(
    async (file: File) => {
      let fileId = '';
      try {
        const { fileId: id, uploadUrl, expiresAt } = await requestUploadUrl({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        });
        fileId = id;

        setEntries((prev) => [
          ...prev,
          { file, fileId, uploadUrl, expiresAt, progress: 0, status: 'uploading' },
        ]);

        await uploadViaXhr(uploadUrl, file, (pct) => patchEntry(fileId, { progress: pct }));
        patchEntry(fileId, { progress: 100 });

        await finalizeFile(fileId);
        await linkFile(target, fileId);

        patchEntry(fileId, { status: 'done' });
        onUploadComplete?.(fileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        if (fileId) patchEntry(fileId, { status: 'error', error: message });
      }
    },
    [target, onUploadComplete, patchEntry],
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
