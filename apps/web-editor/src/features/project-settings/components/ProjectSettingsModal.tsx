import React from 'react';

import { getSnapshot, setProject, useProjectStore } from '@/store/project-store';

import {
  backdropStyle,
  panelStyle,
  headerStyle,
  titleStyle,
  closeButtonStyle,
  bodyStyle,
  sectionStyle,
  sectionLabelStyle,
  presetGridStyle,
  presetButtonStyle,
  presetButtonActiveStyle,
  presetSubtitleStyle,
} from './projectSettingsModalStyles';

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Popular FPS presets for video production. */
export const FPS_PRESETS: number[] = [24, 25, 30, 50, 60];

/** A resolution preset with a display label and platform hint. */
export type ResolutionPreset = {
  /** Preset identifier used as a React key. */
  id: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Short label, e.g. "1080p". */
  label: string;
  /** Target platform hint, e.g. "YouTube (16:9)". */
  platform: string;
};

/** Popular resolution presets covering major video platforms. */
export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '1080p', width: 1920, height: 1080, label: '1080p', platform: 'YouTube (16:9)' },
  { id: '720p', width: 1280, height: 720, label: '720p', platform: 'YouTube (16:9)' },
  { id: '1440p', width: 2560, height: 1440, label: '1440p', platform: 'YouTube (16:9)' },
  { id: '4k', width: 3840, height: 2160, label: '4K', platform: 'YouTube (16:9)' },
  { id: 'vertical', width: 1080, height: 1920, label: 'Vertical', platform: 'Shorts · TikTok (9:16)' },
  { id: 'square', width: 1080, height: 1080, label: 'Square', platform: 'Instagram (1:1)' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the ProjectSettingsModal component. */
export interface ProjectSettingsModalProps {
  /** Called when the modal should be closed. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// ProjectSettingsModal
// ---------------------------------------------------------------------------

/**
 * Modal for configuring project-level FPS and resolution settings.
 *
 * Changes apply immediately to the project store — the auto-save mechanism
 * picks them up without requiring an explicit "Save" action.
 *
 * Presets shown:
 * - **FPS:** 24, 25, 30, 50, 60
 * - **Resolution:** 1080p / 720p / 1440p / 4K / Vertical (Shorts/TikTok) / Square (Instagram)
 */
export function ProjectSettingsModal({ onClose }: ProjectSettingsModalProps): React.ReactElement {
  const { fps, width, height } = useProjectStore();

  const handleFpsSelect = (preset: number): void => {
    const doc = getSnapshot();
    setProject({ ...doc, fps: preset });
  };

  const handleResolutionSelect = (preset: ResolutionPreset): void => {
    const doc = getSnapshot();
    setProject({ ...doc, width: preset.width, height: preset.height });
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      data-testid="project-settings-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={headerStyle}>
          <span id="project-settings-title" style={titleStyle}>
            Project Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project settings"
            style={closeButtonStyle}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* FPS section */}
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>Frame Rate</span>
            <div style={presetGridStyle}>
              {FPS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={fps === preset}
                  onClick={() => handleFpsSelect(preset)}
                  style={fps === preset ? presetButtonActiveStyle : presetButtonStyle}
                >
                  {preset} fps
                </button>
              ))}
            </div>
          </div>

          {/* Resolution section */}
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>Resolution</span>
            <div style={presetGridStyle}>
              {RESOLUTION_PRESETS.map((preset) => {
                const isActive = width === preset.width && height === preset.height;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleResolutionSelect(preset)}
                    style={isActive ? presetButtonActiveStyle : presetButtonStyle}
                  >
                    <span>{preset.label}</span>
                    <span style={presetSubtitleStyle}>{preset.platform}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
