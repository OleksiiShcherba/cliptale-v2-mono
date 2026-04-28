/**
 * SceneModal.mediaSection — uploadDraftId threading tests (SB-UPLOAD-2).
 *
 * Covers:
 * (a) When uploadDraftId is provided, AssetPickerModal receives
 *     uploadTarget = { kind: 'draft', draftId: <value> }.
 * (b) When uploadDraftId is absent, AssetPickerModal receives
 *     uploadTarget = undefined.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

// Capture the props passed to the last AssetPickerModal render.
const { capturedPickerProps } = vi.hoisted(() => ({
  capturedPickerProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: (props: Record<string, unknown>) => {
    capturedPickerProps.current = props;
    return (
      <div data-testid="asset-picker-modal" />
    );
  },
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => `${url}?token=test`,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { SceneModalMediaSection } from './SceneModal.mediaSection';
import type { ModalMediaItem } from './SceneModal.types';
import type { UploadTarget } from '@/shared/file-upload/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderSection(uploadDraftId?: string) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <SceneModalMediaSection
      items={[] as ModalMediaItem[]}
      onAdd={onAdd}
      onRemove={onRemove}
      uploadDraftId={uploadDraftId}
    />,
  );
  return { onAdd, onRemove };
}

/** Open the picker by clicking Add Media then selecting 'Image'. */
function openPicker(): void {
  fireEvent.click(screen.getByTestId('add-media-button'));
  fireEvent.click(screen.getByTestId('type-chip-image'));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SceneModalMediaSection — uploadDraftId threading', () => {
  beforeEach(() => {
    capturedPickerProps.current = null;
  });

  it('(a) passes uploadTarget with kind=draft when uploadDraftId is provided', () => {
    renderSection('draft-xyz');
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget as UploadTarget | undefined;
    expect(uploadTarget).toEqual({ kind: 'draft', draftId: 'draft-xyz' });
  });

  it('(b) passes uploadTarget=undefined when uploadDraftId is absent', () => {
    renderSection(undefined);
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget;
    expect(uploadTarget).toBeUndefined();
  });

  it('(b2) passes uploadTarget=undefined when uploadDraftId is empty string', () => {
    renderSection('');
    openPicker();

    expect(screen.getByTestId('asset-picker-modal')).toBeTruthy();
    const uploadTarget = capturedPickerProps.current?.uploadTarget;
    expect(uploadTarget).toBeUndefined();
  });
});
