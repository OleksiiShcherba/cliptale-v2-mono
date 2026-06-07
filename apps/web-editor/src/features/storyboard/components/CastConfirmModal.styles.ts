/**
 * Co-located styles for CastConfirmModal (F14).
 *
 * Uses shared design-guide tokens from nodeStyles — no raw inline hex.
 */
import type React from 'react';

import { BORDER } from './nodeStyles';

export const castConfirmModalStyles = {
  entryEditor: {
    marginBottom: '1rem',
    padding: '0.5rem',
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties,
} as const;
