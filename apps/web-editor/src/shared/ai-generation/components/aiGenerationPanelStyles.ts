import type React from 'react';

import { aiGenerationFieldStyles } from './aiGenerationFieldStyles';
import {
  BORDER,
  ERROR,
  PRIMARY,
  SUCCESS,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';

/**
 * Re-export of the dark-theme color tokens so consumers that already pull
 * tokens from `./aiGenerationPanelStyles` (e.g. `GenerationProgress`) keep
 * working after the §9.7 file split. The canonical source lives in
 * `./aiGenerationPanelTokens`.
 */
export {
  BORDER,
  ERROR,
  PRIMARY,
  PRIMARY_DARK,
  SUCCESS,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';

/**
 * Returns the panel container style parameterized by display mode.
 *
 * - `compact = true`  — fixed 320 px width used inside the editor left sidebar
 *   so the sidebar never shifts when the user switches tabs.
 * - `compact = false` — fluid 100 % width capped at 720 px used when the panel
 *   is embedded in the wizard gallery, giving it room to breathe.
 */
export function getPanelStyle(compact: boolean): React.CSSProperties {
  return {
    width: compact ? '320px' : '100%',
    maxWidth: compact ? undefined : '720px',
    height: '100%',
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  };
}

/**
 * Base style objects for the AI Generation panel shell, generate button,
 * progress spinner, and result states. Ticket 9 additions (capability tabs,
 * model cards, schema-driven field inputs, asset pickers, inline errors,
 * empty-catalog state) live in `aiGenerationFieldStyles.ts` so this file
 * stays under the §9.7 300-line cap.
 *
 * The exported `aiGenerationPanelStyles` barrel below spreads both objects
 * so all consumers continue to import from a single source.
 */
const baseStyles = {
  // ── Panel shell ───────────────────────────────────────────────────────────

  /** Default panel style (compact=false, wizard embedding). Use `getPanelStyle`
   *  when you need to parameterize the width at render time. */
  panel: getPanelStyle(false),

  header: {
    height: '44px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '12px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '28px',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    fontSize: '18px',
    lineHeight: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
  } as React.CSSProperties,

  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,

  // ── Options form shell ────────────────────────────────────────────────────

  optionsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  optionSelect: {
    width: '100%',
    height: '32px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    padding: '0 8px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  // ── Generate button ───────────────────────────────────────────────────────

  generateButton: {
    width: '100%',
    height: '40px',
    background: PRIMARY,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  generateButtonDisabled: {
    width: '100%',
    height: '40px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'not-allowed',
  } as React.CSSProperties,

  // ── Progress ──────────────────────────────────────────────────────────────

  progressWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 0',
  } as React.CSSProperties,

  progressSpinner: {
    fontSize: '11px',
    color: TEXT_SECONDARY,
    lineHeight: '14px',
    margin: 0,
  } as React.CSSProperties,

  // ── Result states ─────────────────────────────────────────────────────────

  resultWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 0',
    textAlign: 'center',
  } as React.CSSProperties,

  successText: {
    fontSize: '14px',
    fontWeight: 600,
    color: SUCCESS,
    margin: 0,
    lineHeight: '20px',
  } as React.CSSProperties,

  assetAddedText: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    margin: 0,
    lineHeight: '16px',
  } as React.CSSProperties,

  errorText: {
    fontSize: '13px',
    color: ERROR,
    margin: 0,
    lineHeight: '18px',
  } as React.CSSProperties,

  secondaryButton: {
    width: '100%',
    height: '36px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,
} as const;

/**
 * Inline CSSProperties barrel for the AI Generation panel and its
 * sub-components. Composed of the base panel/shell styles plus the Ticket 9
 * field-level extensions imported from `aiGenerationFieldStyles.ts`.
 */
export const aiGenerationPanelStyles = {
  ...baseStyles,
  ...aiGenerationFieldStyles,
} as const;
