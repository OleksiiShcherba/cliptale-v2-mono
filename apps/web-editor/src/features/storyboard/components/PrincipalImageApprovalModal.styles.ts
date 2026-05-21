import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  SURFACE,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './SceneModal.styles';

export const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

export const dialogStyle: React.CSSProperties = {
  width: '720px',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: '88vh',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

export const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  lineHeight: '24px',
  fontWeight: 600,
};

export const closeButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '4px',
  background: 'transparent',
  color: TEXT_SECONDARY,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const bodyStyle: React.CSSProperties = {
  padding: '20px',
  display: 'grid',
  gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
  gap: '20px',
  overflowY: 'auto',
};

export const bodyCompactStyle: React.CSSProperties = {
  ...bodyStyle,
  gridTemplateColumns: '1fr',
  padding: '16px',
};

export const previewShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1 / 1',
  minHeight: '220px',
  maxHeight: '360px',
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const previewLoadingOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  background: 'rgba(13,13,20,0.72)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  color: TEXT_PRIMARY,
  fontSize: '13px',
  fontWeight: 500,
};

export const previewSpinnerStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  border: `2px solid ${BORDER}`,
  borderTopColor: PRIMARY,
};

export const previewImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
};

export const previewButtonStyle: React.CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  background: 'transparent',
  width: '100%',
  height: '100%',
  cursor: 'zoom-in',
};

export const previewFallbackStyle: React.CSSProperties = {
  color: TEXT_SECONDARY,
  fontSize: '13px',
  fontWeight: 500,
};

export const controlsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  minWidth: 0,
};

export const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 500,
  color: TEXT_SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

export const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '96px',
  resize: 'vertical',
  background: SURFACE_ALT,
  color: TEXT_PRIMARY,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  lineHeight: '20px',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

export const referenceListStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

export const referencePreviewStyle: React.CSSProperties = {
  position: 'relative',
  width: '56px',
  height: '56px',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  overflow: 'hidden',
  flexShrink: 0,
};

export const referencePreviewImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

export const referencePreviewButtonStyle: React.CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  background: 'transparent',
  width: '100%',
  height: '100%',
  cursor: 'zoom-in',
};

export const removeChipButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'rgba(13,13,20,0.82)',
  color: TEXT_PRIMARY,
  cursor: 'pointer',
  padding: 0,
  width: '20px',
  height: '20px',
  borderRadius: '999px',
  position: 'absolute',
  top: '4px',
  right: '4px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

export const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  background: 'transparent',
  color: TEXT_PRIMARY,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

export const primaryButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: `1px solid ${PRIMARY}`,
  background: PRIMARY,
};

export const disabledButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  cursor: 'not-allowed',
  opacity: 0.5,
};

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '16px 20px',
  borderTop: `1px solid ${BORDER}`,
  flexShrink: 0,
};

export const errorStyle: React.CSSProperties = {
  color: ERROR,
  fontSize: '12px',
  lineHeight: '16px',
  margin: 0,
};
