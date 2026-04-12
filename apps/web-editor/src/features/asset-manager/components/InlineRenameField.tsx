import React, { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { updateAsset } from '@/features/asset-manager/api';

import { inlineRenameStyles as s } from './assetDetailPanel.styles';

export interface InlineRenameFieldProps {
  assetId: string;
  projectId: string;
  displayedName: string;
}

export function InlineRenameField({ assetId, projectId, displayedName }: InlineRenameFieldProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const startEditing = useCallback(() => {
    setEditValue(displayedName);
    setRenameError(null);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayedName]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setRenameError(null);
  }, []);

  const commitRename = useCallback(async () => {
    const trimmed = editValue.trim();
    if (trimmed === displayedName) {
      setIsEditing(false);
      return;
    }
    if (trimmed.length === 0) {
      setRenameError('Name cannot be empty');
      return;
    }
    if (trimmed.length > 255) {
      setRenameError('Name must be 255 characters or fewer');
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      await updateAsset(assetId, trimmed);
      await queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
      setIsEditing(false);
    } catch {
      setRenameError('Failed to rename asset');
    } finally {
      setIsRenaming(false);
    }
  }, [assetId, editValue, displayedName, projectId, queryClient]);

  if (isEditing) {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={s.wrapper}>
          <div style={s.inputRow(!!renameError)}>
            <input
              ref={inputRef}
              aria-label="Asset display name"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { void commitRename(); }
                else if (e.key === 'Escape') { cancelEditing(); }
              }}
              onBlur={() => { void commitRename(); }}
              disabled={isRenaming}
              maxLength={255}
              style={s.input(isRenaming)}
            />
          </div>
          {renameError && (
            <span role="alert" style={s.errorText}>
              {renameError}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={s.viewRow}>
        <span style={s.displayName}>
          {displayedName}
        </span>
        <button
          aria-label="Rename asset"
          onClick={startEditing}
          style={s.pencilButton}
        >
          ✏️
        </button>
      </div>
    </div>
  );
}
