import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  PRIMARY_DARK,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';

/**
 * Inline CSSProperties for the VoicePickerModal overlay component.
 *
 * Field-trigger styles live in `voiceFieldStyles.ts` so both files stay
 * under the §9.7 300-line cap.
 */

// ── Modal overlay ─────────────────────────────────────────────────────────────

/** Full-page semi-transparent backdrop. */
export const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

/** Modal panel itself — `surface-elevated` background per design-guide §8. */
export const modalPanel: React.CSSProperties = {
  width: '560px',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: '80vh',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
};

/** Modal header bar with title and close button. */
export const modalHeader: React.CSSProperties = {
  height: '48px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: '20px',
  paddingRight: '12px',
  borderBottom: `1px solid ${BORDER}`,
};

/** Modal heading text. */
export const modalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 600,
  color: TEXT_PRIMARY,
  lineHeight: '24px',
};

/** "×" dismiss button in the modal header. */
export const modalCloseButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: TEXT_SECONDARY,
  fontSize: '18px',
  lineHeight: '18px',
  cursor: 'pointer',
  padding: '4px 8px',
};

/** Search bar container below the header. */
export const modalSearchBar: React.CSSProperties = {
  padding: '12px 20px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

/** Search text input. */
export const modalSearchInput: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 12px',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontSize: '14px',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

/** Scrollable list region that fills the remaining modal height. */
export const modalBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

/** Section heading: "Your Voices" / "ElevenLabs Library". */
export const modalSectionHeading: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 600,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  paddingBottom: '8px',
  borderBottom: `1px solid ${BORDER}`,
};

// ── Voice rows ────────────────────────────────────────────────────────────────

/** Voice list container inside a section. */
export const voiceList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

/** Base for a single voice row — highlighted when selected. */
export const voiceRowBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  border: `1px solid transparent`,
  background: 'transparent',
  width: '100%',
  textAlign: 'left',
};

/** Voice row when the voice is currently the selected one. */
export const voiceRowSelected: React.CSSProperties = {
  ...voiceRowBase,
  background: `rgba(124, 58, 237, 0.12)`,
  border: `1px solid ${PRIMARY}`,
};

/** Hover style for voice row — applied via onMouseEnter/Leave. */
export const voiceRowHover: React.CSSProperties = {
  ...voiceRowBase,
  background: `rgba(255, 255, 255, 0.04)`,
};

/** Voice name text. */
export const voiceRowName: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: TEXT_PRIMARY,
  lineHeight: '16px',
  margin: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Category / label text beneath the name. */
export const voiceRowCategory: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
  margin: 0,
};

/** Column wrapper for name + category inside a voice row. */
export const voiceRowInfo: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

/** Play / Stop button for the audio preview. */
export const playButton: React.CSSProperties = {
  flexShrink: 0,
  width: '28px',
  height: '28px',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '9999px',
  color: TEXT_PRIMARY,
  fontSize: '11px',
  lineHeight: '11px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Inter, sans-serif',
};

// ── Footer buttons ────────────────────────────────────────────────────────────

/** Modal footer bar with the confirm CTA. */
export const modalFooter: React.CSSProperties = {
  flexShrink: 0,
  padding: '12px 20px',
  borderTop: `1px solid ${BORDER}`,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

/** "Use this voice" primary CTA button. */
export const confirmButton: React.CSSProperties = {
  height: '36px',
  padding: '0 20px',
  background: PRIMARY,
  border: 'none',
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
};

/** Disabled variant of the confirm button — no voice selected yet. */
export const confirmButtonDisabled: React.CSSProperties = {
  ...confirmButton,
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  color: TEXT_SECONDARY,
  cursor: 'not-allowed',
};

/** "Cancel" secondary button in the modal footer. */
export const cancelButton: React.CSSProperties = {
  height: '36px',
  padding: '0 16px',
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
};

// ── State messages ────────────────────────────────────────────────────────────

/** Inline loading/error/empty text displayed inside list sections. */
export const stateMessage: React.CSSProperties = {
  fontSize: '12px',
  color: TEXT_SECONDARY,
  fontFamily: 'Inter, sans-serif',
  lineHeight: '16px',
  padding: '8px 0',
};

/** Inline error text (red). */
export const errorMessage: React.CSSProperties = {
  ...stateMessage,
  color: ERROR,
};

/** Primary dark hover for the confirm button. */
export const confirmButtonHover: React.CSSProperties = {
  ...confirmButton,
  background: PRIMARY_DARK,
};
