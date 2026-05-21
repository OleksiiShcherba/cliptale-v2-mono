import type React from 'react';

import {
  BORDER,
  SURFACE,
  TEXT_PRIMARY,
} from './SceneModal.styles';
import {
  closeButtonStyle,
} from './PrincipalImageApprovalModal.styles';

export const lightboxBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  background: 'rgba(0,0,0,0.86)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
};

export const lightboxDialogStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(1040px, calc(100vw - 48px))',
  height: 'min(760px, calc(100vh - 48px))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const lightboxImageStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: '8px',
  background: SURFACE,
};

export const lightboxCloseButtonStyle: React.CSSProperties = {
  ...closeButtonStyle,
  position: 'absolute',
  top: '12px',
  right: '12px',
  background: 'rgba(13,13,20,0.82)',
  color: TEXT_PRIMARY,
  border: `1px solid ${BORDER}`,
  zIndex: 1,
};
