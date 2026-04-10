import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  SURFACE_ALT,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';

const tabButtonBase: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '4px 8px',
  background: 'transparent',
  border: 'none',
  color: TEXT_SECONDARY,
  fontSize: '11px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  lineHeight: '14px',
  cursor: 'pointer',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const modelCardBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '12px',
  background: SURFACE_ELEVATED,
  borderRadius: '8px',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'Inter, sans-serif',
  width: '100%',
};

const inputBase: React.CSSProperties = {
  width: '100%',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_PRIMARY,
  fontSize: '13px',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

/**
 * Inline CSSProperties barrel for the Ticket 9 field-level styles. Merged
 * into the main `aiGenerationPanelStyles` barrel via spread so every
 * consumer continues to import from a single source.
 */
export const aiGenerationFieldStyles = {
  // ── Capability tabs ──────────────────────────────────────────────────────
  tabRow: {
    display: 'flex',
    gap: '4px',
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: '4px',
  } as React.CSSProperties,

  tabButton: {
    ...tabButtonBase,
    borderBottom: '2px solid transparent',
  } as React.CSSProperties,

  tabButtonActive: {
    ...tabButtonBase,
    borderBottom: `2px solid ${PRIMARY}`,
    color: TEXT_PRIMARY,
    fontWeight: 600,
  } as React.CSSProperties,

  // ── Model cards ──────────────────────────────────────────────────────────
  modelList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  modelCard: {
    ...modelCardBase,
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  modelCardSelected: {
    ...modelCardBase,
    border: `1px solid ${PRIMARY}`,
    boxShadow: `0 0 0 1px ${PRIMARY}`,
  } as React.CSSProperties,

  modelCardLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
    margin: 0,
  } as React.CSSProperties,

  modelCardDescription: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  // ── Schema field inputs ──────────────────────────────────────────────────
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  fieldRequiredMarker: {
    color: ERROR,
    marginLeft: '4px',
  } as React.CSSProperties,

  fieldHelp: {
    fontSize: '11px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '14px',
    margin: 0,
  } as React.CSSProperties,

  textInput: {
    ...inputBase,
    height: '32px',
    padding: '0 8px',
  } as React.CSSProperties,

  textAreaInput: {
    ...inputBase,
    minHeight: '64px',
    maxHeight: '160px',
    resize: 'vertical',
    padding: '8px',
    lineHeight: '18px',
  } as React.CSSProperties,

  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '18px',
  } as React.CSSProperties,

  stringListRow: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  } as React.CSSProperties,

  stringListRemove: {
    flexShrink: 0,
    width: '32px',
    height: '32px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,

  stringListAdd: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  // ── Asset picker (image_url / image_url_list fields) ────────────────────
  assetPickerEmpty: {
    width: '100%',
    minHeight: '40px',
    padding: '8px 12px',
    background: SURFACE_ELEVATED,
    border: `1px dashed ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  assetPickerValue: {
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
  } as React.CSSProperties,

  assetPickerChipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  } as React.CSSProperties,

  assetPickerChip: {
    padding: '4px 8px',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '9999px',
    color: TEXT_PRIMARY,
    fontSize: '11px',
    fontFamily: 'Inter, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  assetPickerChipRemove: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    padding: 0,
    fontSize: '12px',
    lineHeight: '12px',
  } as React.CSSProperties,

  assetPickerPickButton: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  // ── Inline error + empty states ─────────────────────────────────────────
  inlineError: {
    padding: '12px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${ERROR}`,
    borderRadius: '8px',
    color: ERROR,
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  emptyCatalog: {
    padding: '24px 12px',
    color: TEXT_SECONDARY,
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    textAlign: 'center',
    lineHeight: '18px',
  } as React.CSSProperties,
} as const;
