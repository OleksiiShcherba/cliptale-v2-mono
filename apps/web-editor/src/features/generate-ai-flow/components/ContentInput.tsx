/**
 * ContentInput — edits a content block's supplied content (T18 / AC-16).
 *
 * Three source modes, keyed by the block's modality:
 *   - text block  → a simple textarea; writes params.contentType:'text' + params.text
 *   - asset block → file upload (useFileUpload) + AssetPickerField (existing library picker)
 *                   writes params.contentType:'asset' + params.fileId
 *
 * The `onBlockParamsChange(newParams)` callback is called whenever the user edits
 * the content. The parent (Inspector or FlowCanvas) merges the patch into the canvas doc.
 */

import React, { useEffect, useRef, useState } from 'react';

import type { FlowBlock } from '@ai-video-editor/project-schema';
import { AssetPickerField } from '@/shared/ai-generation/components/AssetPickerField';
import { useFileUpload } from '@/shared/file-upload/useFileUpload';
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  SURFACE_BASE,
  BORDER,
} from './flowNodeStyles';

// Flows have no project/draft scope — content blocks pull from (and upload into) the
// Creator's whole general library, which the backend Generate gate resolves directly
// by fileId (findByIdForUser). So the picker uses the 'library' asset context.
const FLOW_ASSET_CONTEXT = { kind: 'library' as const };

export type ContentInputProps = {
  block: FlowBlock;
  /**
   * Called when the user edits the content. The payload is the *partial* param
   * patch to merge onto the block (contentType + text OR fileId).
   */
  onBlockParamsChange: (params: Record<string, unknown>) => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: SURFACE_BASE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_PRIMARY,
  fontSize: 12,
  padding: '6px 8px',
  fontFamily: 'Inter, sans-serif',
  resize: 'vertical',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
  marginBottom: 4,
  display: 'block',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/**
 * The Modality type this block carries, from block.params.modality.
 */
type AssetMediaType = 'image' | 'audio' | 'video';

function isAssetMediaType(m: unknown): m is AssetMediaType {
  return m === 'image' || m === 'audio' || m === 'video';
}

export function ContentInput({ block, onBlockParamsChange }: ContentInputProps): React.ReactElement | null {
  if (block.type !== 'content') return null;

  const contentType = block.params.contentType as string | undefined;
  const modality = block.params.modality as string | undefined;

  if (contentType === 'text' || modality === 'text') {
    return (
      <TextInput
        value={(block.params.text as string | undefined) ?? ''}
        onBlockParamsChange={onBlockParamsChange}
      />
    );
  }

  // asset block (image / audio / video)
  const mediaType: AssetMediaType = isAssetMediaType(modality) ? modality : 'image';
  const currentFileId = (block.params.fileId as string | undefined) ?? '';

  return (
    <AssetInput
      mediaType={mediaType}
      currentFileId={currentFileId}
      onBlockParamsChange={onBlockParamsChange}
    />
  );
}

// ── Text sub-component ────────────────────────────────────────────────────────

function TextInput({
  value: initialValue,
  onBlockParamsChange,
}: {
  value: string;
  onBlockParamsChange: (params: Record<string, unknown>) => void;
}): React.ReactElement {
  // Local state so the textarea updates immediately on every keystroke.
  // The canvas-doc value (initialValue) is the persisted snapshot; local state
  // diverges while the user types, and each change is bubbled up via the callback.
  const [text, setText] = useState(initialValue);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    onBlockParamsChange({ contentType: 'text', text: next });
  };

  return (
    <div style={sectionStyle}>
      <label style={labelStyle}>Text content</label>
      <textarea
        style={{ ...inputStyle, minHeight: 72 }}
        value={text}
        onChange={handleChange}
        placeholder="Type your text here…"
        aria-label="Text content"
        rows={3}
        // Selecting a content block focuses its editor so keyboard input lands here
        // immediately (drives the edit→autosave path).
        autoFocus
      />
    </div>
  );
}

// ── Asset sub-component (upload + library pick) ───────────────────────────────

function AssetInput({
  mediaType,
  currentFileId,
  onBlockParamsChange,
}: {
  mediaType: AssetMediaType;
  currentFileId: string;
  onBlockParamsChange: (params: Record<string, unknown>) => void;
}): React.ReactElement {
  // Track which fileId we've already reported to avoid double-firing
  const reportedFileId = useRef<string>('');

  const { entries, uploadFiles } = useFileUpload({
    // Upload straight into the Creator's general library; finalize places it there and
    // the block stores the returned fileId (the Generate gate resolves it by owner).
    target: { kind: 'library' },
    onUploadComplete: (fileId) => {
      reportedFileId.current = fileId;
      onBlockParamsChange({ contentType: 'asset', fileId });
    },
  });

  // Also fire for entries that complete (covers the re-render path in tests)
  useEffect(() => {
    for (const entry of entries) {
      if (entry.status === 'done' && entry.fileId !== reportedFileId.current) {
        reportedFileId.current = entry.fileId;
        onBlockParamsChange({ contentType: 'asset', fileId: entry.fileId });
      }
    }
  }, [entries, onBlockParamsChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  const handleLibraryPick = (fileId: string | string[] | undefined) => {
    if (typeof fileId === 'string' && fileId.length > 0) {
      onBlockParamsChange({ contentType: 'asset', fileId });
    }
  };

  const mediaLabel =
    mediaType === 'audio' ? 'Audio' : mediaType === 'video' ? 'Video' : 'Image';

  return (
    <div style={sectionStyle}>
      {/* File upload */}
      <div>
        <label style={labelStyle}>Upload {mediaLabel}</label>
        <input
          type="file"
          data-testid="file-upload-input"
          accept={
            mediaType === 'audio'
              ? 'audio/*'
              : mediaType === 'video'
                ? 'video/*'
                : 'image/*'
          }
          onChange={handleFileChange}
          style={{ fontSize: 11, color: TEXT_SECONDARY }}
        />
        {entries.some((e) => e.status === 'uploading') && (
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}> Uploading…</span>
        )}
      </div>

      {/* Library picker (existing component — reused as-is) */}
      <AssetPickerField
        context={FLOW_ASSET_CONTEXT}
        mode="single"
        value={currentFileId || undefined}
        onChange={handleLibraryPick}
        label={`Pick ${mediaLabel} from library`}
        mediaType={mediaType}
      />
    </div>
  );
}
