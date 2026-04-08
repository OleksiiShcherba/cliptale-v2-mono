import React, { useState, useCallback, useEffect, useRef } from 'react';

import type { Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';
import { useAddAssetToTimeline } from '@/features/asset-manager/hooks/useAddAssetToTimeline';
import { useTracksForAsset } from '@/features/asset-manager/hooks/useTracksForAsset';
import { trackTypeLabel } from '@/features/asset-manager/utils';
import {
  wrapperStyle,
  triggerButtonStyle,
  triggerButtonDisabledStyle,
  triggerButtonHoverStyle,
  dropdownPanelStyle,
  sectionLabelStyle,
  dividerStyle,
  itemStyle,
  itemHoverStyle,
} from './addToTimelineDropdownStyles';

/** Props for the AddToTimelineDropdown component. */
export interface AddToTimelineDropdownProps {
  /** The asset to place on the timeline. */
  asset: Asset;
  /** Project ID required for clip persistence. */
  projectId: string;
  /** When true the trigger button is disabled and the dropdown cannot open. */
  disabled?: boolean;
}

/**
 * Adds an asset to the timeline. When no existing tracks of the matching type
 * exist, renders a plain button that directly creates a new track. When at
 * least one matching track exists, renders a dropdown offering both a new track
 * option and the existing tracks.
 *
 * Closes automatically when the user clicks outside the component.
 */
export function AddToTimelineDropdown({
  asset,
  projectId,
  disabled = false,
}: AddToTimelineDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { addAssetToNewTrack, addAssetToExistingTrack } = useAddAssetToTimeline(projectId);
  const existingTracks = useTracksForAsset(asset);
  const typeLabel = trackTypeLabel(asset.contentType);

  // Close dropdown when user clicks outside the component.
  useEffect(() => {
    if (!isOpen) return;
    function handleOutsideClick(e: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const hasExistingTracks = existingTracks.length > 0;

  const handleTriggerClick = useCallback(() => {
    if (disabled) return;
    if (!hasExistingTracks) {
      addAssetToNewTrack(asset);
      return;
    }
    setIsOpen(prev => !prev);
  }, [disabled, hasExistingTracks, addAssetToNewTrack, asset]);

  const handleNewTrack = useCallback(() => {
    addAssetToNewTrack(asset);
    setIsOpen(false);
  }, [asset, addAssetToNewTrack]);

  const handleExistingTrack = useCallback((track: Track) => {
    addAssetToExistingTrack(asset, track.id);
    setIsOpen(false);
  }, [asset, addAssetToExistingTrack]);

  const triggerStyle = disabled
    ? triggerButtonDisabledStyle
    : isHovered
      ? triggerButtonHoverStyle
      : triggerButtonStyle;

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleTriggerClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-haspopup={hasExistingTracks ? 'listbox' : undefined}
        aria-expanded={hasExistingTracks ? isOpen : undefined}
        aria-label={`Add ${asset.filename} to timeline`}
        style={triggerStyle}
      >
        Add to Timeline
        {hasExistingTracks && (
          <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>▾</span>
        )}
      </button>

      {isOpen && hasExistingTracks && (
        <div
          role="listbox"
          aria-label="Choose track"
          style={dropdownPanelStyle}
          onMouseLeave={() => setHoveredItem(null)}
        >
          {/* New track option — always first */}
          <button
            role="option"
            aria-selected={false}
            type="button"
            onClick={handleNewTrack}
            onMouseEnter={() => setHoveredItem('new')}
            style={hoveredItem === 'new' ? itemHoverStyle : itemStyle}
          >
            To New {typeLabel} Track
          </button>

          <div role="separator" style={dividerStyle} />
          <div style={sectionLabelStyle}>Existing {typeLabel} Tracks</div>
          {existingTracks.map(track => (
            <button
              key={track.id}
              role="option"
              aria-selected={false}
              type="button"
              onClick={() => handleExistingTrack(track)}
              onMouseEnter={() => setHoveredItem(track.id)}
              style={hoveredItem === track.id ? itemHoverStyle : itemStyle}
            >
              To Existing: {track.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
