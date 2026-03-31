import React from 'react';

import type { UploadEntry } from '@/features/asset-manager/types';

export interface UploadProgressListProps {
  entries: UploadEntry[];
}

/**
 * Scrollable list of per-file upload progress rows rendered inside UploadDropzone.
 * Each row shows filename + status text, with a progress bar while uploading.
 */
export function UploadProgressList({ entries }: UploadProgressListProps): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        margin: '12px 24px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxHeight: 160,
        overflowY: 'auto',
      }}
    >
      {entries.map((entry) => (
        <div key={entry.assetId}>
          <div
            style={{
              height: 48,
              backgroundColor: '#16161F',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: '#F0F0FA',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {entry.file.name}
            </span>
            <span style={{ fontSize: 12, color: '#8A8AA0', marginLeft: 8, flexShrink: 0 }}>
              {entry.status === 'uploading' ? `${entry.progress}%` : entry.status}
            </span>
          </div>
          {entry.status === 'uploading' && (
            <div
              role="progressbar"
              aria-valuenow={entry.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Upload progress for ${entry.file.name}`}
              style={{
                height: 6,
                borderRadius: 9999,
                backgroundColor: '#252535',
                margin: '2px 0',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${entry.progress}%`,
                  borderRadius: 9999,
                  backgroundColor: '#7C3AED',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
