/**
 * SceneModal.mediaSection — persisted motion_graphic rendering (AC-04/US-07).
 *
 * Defect: after a reload, a persisted motion_graphic media item degraded into
 * the audio/speaker placeholder with an empty badge. This test asserts the
 * section renders the real motion-graphic preview (`persisted-motion-graphic-preview`)
 * and a "MOTION GRAPHIC" badge instead.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockApiClientGet } = vi.hoisted(() => ({
  mockApiClientGet: vi.fn(),
}));

// Mock the runtime player so the test does not depend on Remotion's heavy mount.
vi.mock('@/features/motion-graphic/runtime', () => ({
  MotionGraphicPlayer: (props: { code: string }) => (
    <div data-testid="mock-motion-graphic-player" data-code={props.code} />
  ),
}));

vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: () => <div data-testid="asset-picker-modal" />,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiClientGet },
  buildAuthenticatedUrl: (url: string) => `${url}?token=test`,
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

import { SceneModalMediaSection } from './SceneModal.mediaSection';
import type { ModalMediaItem } from './SceneModal.types';

describe('SceneModalMediaSection — persisted motion_graphic', () => {
  beforeEach(() => {
    mockApiClientGet.mockReset();
  });

  it('renders the motion-graphic preview and a MOTION GRAPHIC badge (not the audio placeholder)', () => {
    const item: ModalMediaItem = {
      fileId: '',
      mediaType: 'motion_graphic',
      filename: 'Bouncing logo',
      sortOrder: 0,
      motionGraphic: {
        snapshotId: 'snap-1',
        code: 'export const C = () => null;',
        durationSeconds: 4,
        fps: 30,
        width: 1920,
        height: 1080,
      },
    };

    render(
      <SceneModalMediaSection items={[item]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByTestId('persisted-motion-graphic-preview')).toBeTruthy();
    expect(screen.getByTestId('mock-motion-graphic-player')).toBeTruthy();
    expect(screen.getByText('MOTION GRAPHIC')).toBeTruthy();
    // Must NOT fall back to the audio/speaker placeholder.
    expect(screen.queryByTestId('media-preview-placeholder')).toBeNull();
  });
});
