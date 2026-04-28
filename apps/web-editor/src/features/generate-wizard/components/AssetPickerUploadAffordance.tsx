/**
 * Upload affordance sub-component for AssetPickerModal.
 *
 * Renders either:
 * - An "Upload new file" button (idle state), or
 * - A "{progress}%" text indicator (while uploading)
 *
 * Also renders the hidden <input type="file"> that backs the upload button.
 * Extracted from AssetPickerModal to keep both files within the §9.7 300-line cap.
 */

import React, { useRef, useCallback } from 'react';

import type { AssetKind } from '@/features/generate-wizard/types';
import type { UploadTarget } from '@/shared/file-upload/types';
import { useFileUpload } from '@/shared/file-upload/useFileUpload';

import { uploadButtonStyle, uploadProgressStyle } from './assetPickerModalStyles';

// ---------------------------------------------------------------------------
// MIME accept attribute for <input type="file"> per AssetKind
// ---------------------------------------------------------------------------

const MIME_ACCEPT: Record<AssetKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssetPickerUploadAffordanceProps {
  mediaType: AssetKind;
  uploadTarget: UploadTarget;
  /** Called when upload completes — receives the new file's AssetSummary shape. */
  onUploadComplete: (fileId: string, file: File) => void;
}

// ---------------------------------------------------------------------------
// AssetPickerUploadAffordance
// ---------------------------------------------------------------------------

/**
 * Renders the upload button / progress indicator and the hidden file input.
 * Calls `onUploadComplete(fileId, file)` when the presigned upload finishes.
 */
export function AssetPickerUploadAffordance({
  mediaType,
  uploadTarget,
  onUploadComplete,
}: AssetPickerUploadAffordanceProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  const handleUploadDone = useCallback(
    (fileId: string) => {
      const file = pendingFileRef.current;
      if (file) {
        onUploadComplete(fileId, file);
      }
    },
    [onUploadComplete],
  );

  const { entries, isUploading, uploadFiles } = useFileUpload({
    target: uploadTarget,
    onUploadComplete: handleUploadDone,
  });

  const uploadingEntry = entries.find((e) => e.status === 'uploading');
  const uploadProgress = uploadingEntry?.progress ?? 0;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      pendingFileRef.current = file;
      uploadFiles([file]);
      // Reset value so the same file can be re-selected on retry
      e.target.value = '';
    },
    [uploadFiles],
  );

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      {isUploading ? (
        <div
          style={uploadProgressStyle}
          data-testid="upload-progress"
          aria-live="polite"
        >
          {uploadProgress}%
        </div>
      ) : (
        <button
          type="button"
          style={uploadButtonStyle}
          onClick={handleButtonClick}
          data-testid="upload-button"
        >
          Upload new file
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={MIME_ACCEPT[mediaType]}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        data-testid="upload-file-input"
        aria-hidden="true"
      />
    </>
  );
}
