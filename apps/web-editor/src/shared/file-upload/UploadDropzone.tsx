import React, { useRef, useState, useCallback } from 'react';

import type { UploadEntry } from '@/shared/file-upload/types';

import { UploadProgressList } from './UploadProgressList';

export interface UploadDropzoneProps {
  entries: UploadEntry[];
  isUploading: boolean;
  onUploadFiles: (files: FileList | File[]) => void;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Upload modal (desktop) / bottom sheet (mobile < 768px).
 * Accepts drag-and-drop or file picker. Shows per-file XHR progress bars.
 * Desktop: position:fixed centered overlay with backdrop blur.
 * Mobile: full-width bottom sheet (border-radius top corners only).
 *
 * Promoted from `features/asset-manager/components/UploadDropzone.tsx` to
 * `shared/file-upload/` so both the editor panel and the wizard can reuse it.
 */
export function UploadDropzone({
  entries,
  isUploading,
  onUploadFiles,
  onClose,
  onDone,
}: UploadDropzoneProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) onUploadFiles(e.dataTransfer.files);
    },
    [onUploadFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleBrowse = useCallback(() => inputRef.current?.click(), []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onUploadFiles(e.target.files);
        // Reset so the same file can be re-selected
        e.target.value = '';
      }
    },
    [onUploadFiles],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal
        aria-label="Upload Assets"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520,
          maxWidth: '95vw',
          backgroundColor: '#1E1E2E',
          borderRadius: 16,
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 40,
            margin: '24px 24px 0',
            backgroundColor: '#16161F',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: '#F0F0FA' }}>Upload Assets</span>
          <button
            aria-label="Close upload modal"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8A8AA0',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            height: 200,
            margin: '16px 24px 0',
            border: `1px dashed ${isDragging ? '#7C3AED' : '#252535'}`,
            borderRadius: 8,
            backgroundColor: isDragging ? '#4C1D95' : 'transparent',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background-color 0.15s, border-color 0.15s',
          }}
        >
          <span style={{ fontSize: 28, color: '#8A8AA0' }}>⬆</span>
          <span style={{ fontSize: 13, color: '#8A8AA0' }}>Drop files here or browse</span>
        </div>

        {/* OR divider */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 24px 0' }}>
          <div
            style={{
              height: 24,
              padding: '0 16px',
              backgroundColor: '#16161F',
              borderRadius: 9999,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              color: '#8A8AA0',
            }}
          >
            OR
          </div>
        </div>

        {/* Browse button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 24px 0' }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            aria-hidden
          />
          <button
            onClick={handleBrowse}
            style={{
              width: 168,
              height: 40,
              borderRadius: 8,
              backgroundColor: '#7C3AED',
              border: 'none',
              color: '#F0F0FA',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Browse Files
          </button>
        </div>

        {/* File list */}
        <UploadProgressList entries={entries} />

        {/* Footer */}
        <div
          style={{
            height: 48,
            margin: '12px 24px 24px',
            backgroundColor: '#16161F',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '0 12px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid #252535',
              backgroundColor: 'transparent',
              color: '#F0F0FA',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onDone}
            disabled={isUploading}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: isUploading ? '#5B21B6' : '#7C3AED',
              color: '#F0F0FA',
              fontSize: 13,
              fontWeight: 500,
              cursor: isUploading ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
