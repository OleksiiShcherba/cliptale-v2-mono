import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ProjectDoc, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { useTracksForAsset } from './useTracksForAsset';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const storeState = vi.hoisted(() => ({ doc: null as unknown as ProjectDoc }));

vi.mock('@/store/project-store', () => ({
  subscribe: vi.fn((cb: () => void) => {
    // Minimal subscribe: returns unsubscribe no-op
    void cb;
    return () => undefined;
  }),
  getSnapshot: vi.fn(() => storeState.doc),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-001',
    type: 'video',
    name: 'Main',
    muted: false,
    locked: false,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'test.mp4',
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/test.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDoc(tracks: Track[] = []): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks,
    clips: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as ProjectDoc;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTracksForAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when there are no tracks', () => {
    storeState.doc = makeDoc([]);
    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'video/mp4' })));
    expect(result.current).toEqual([]);
  });

  it('returns video tracks for a video/* asset', () => {
    const videoTrack = makeTrack({ id: 'v1', type: 'video', name: 'Video' });
    const audioTrack = makeTrack({ id: 'a1', type: 'audio', name: 'Audio' });
    storeState.doc = makeDoc([videoTrack, audioTrack]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'video/mp4' })));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.id).toBe('v1');
  });

  it('returns video tracks for an image/* asset', () => {
    const videoTrack = makeTrack({ id: 'v1', type: 'video', name: 'Video' });
    storeState.doc = makeDoc([videoTrack]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'image/png' })));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.id).toBe('v1');
  });

  it('returns audio tracks for an audio/* asset', () => {
    const videoTrack = makeTrack({ id: 'v1', type: 'video', name: 'Video' });
    const audioTrack = makeTrack({ id: 'a1', type: 'audio', name: 'Audio' });
    storeState.doc = makeDoc([videoTrack, audioTrack]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'audio/mpeg' })));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.id).toBe('a1');
  });

  it('returns all matching tracks, not just the first', () => {
    const v1 = makeTrack({ id: 'v1', type: 'video', name: 'V1' });
    const v2 = makeTrack({ id: 'v2', type: 'video', name: 'V2' });
    const a1 = makeTrack({ id: 'a1', type: 'audio', name: 'A1' });
    storeState.doc = makeDoc([v1, v2, a1]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'video/mp4' })));
    expect(result.current).toHaveLength(2);
    expect(result.current.map(t => t.id)).toEqual(['v1', 'v2']);
  });

  it('returns an empty array for unsupported content types', () => {
    const videoTrack = makeTrack({ id: 'v1', type: 'video' });
    storeState.doc = makeDoc([videoTrack]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'application/pdf' })));
    expect(result.current).toEqual([]);
  });

  it('does not return caption tracks for a video asset', () => {
    const captionTrack: Track = { id: 'c1', type: 'captions', name: 'Captions 1', muted: false, locked: false };
    const videoTrack = makeTrack({ id: 'v1', type: 'video', name: 'Video' });
    storeState.doc = makeDoc([captionTrack, videoTrack]);

    const { result } = renderHook(() => useTracksForAsset(makeAsset({ contentType: 'video/mp4' })));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.id).toBe('v1');
  });
});
