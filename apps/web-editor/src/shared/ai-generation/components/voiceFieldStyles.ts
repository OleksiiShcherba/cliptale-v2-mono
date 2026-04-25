import type React from 'react';

import {
  BORDER,
  ERROR,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';

/**
 * Inline CSSProperties for the VoicePickerField inline trigger component.
 *
 * Extracted from the styles barrel so the file stays under the §9.7 300-line cap.
 * Imported exclusively by `VoicePickerField.tsx`.
 */

/** Outer wrapper that occupies the full field width. */
export const voiceFieldWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

/** Label text above the trigger button. */
export const voiceFieldLabel: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
  margin: 0,
};

/** Red asterisk appended to required field labels. */
export const voiceFieldRequiredMarker: React.CSSProperties = {
  color: ERROR,
  marginLeft: '4px',
};

/** Trigger button when no voice is selected — dashed border. */
export const voiceFieldEmpty: React.CSSProperties = {
  width: '100%',
  minHeight: '40px',
  padding: '8px 12px',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_SECONDARY,
  fontSize: '12px',
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
};

/** Trigger row when a voice is already selected — solid border + name + clear. */
export const voiceFieldSelected: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontSize: '12px',
  fontFamily: 'Inter, sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

/** Small "×" button that clears the current selection. */
export const voiceFieldClear: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: TEXT_SECONDARY,
  cursor: 'pointer',
  padding: 0,
  fontSize: '14px',
  lineHeight: '14px',
  flexShrink: 0,
};

/** Help / description text below the trigger. */
export const voiceFieldHelp: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
  margin: 0,
};
