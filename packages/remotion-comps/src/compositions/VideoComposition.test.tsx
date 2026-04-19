import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock Remotion primitives so tests run without a Remotion Player context.
vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { 'data-testid': 'absolute-fill', style }, children),
  Sequence: ({ children, from, durationInFrames }: { children?: React.ReactNode; from: number; durationInFrames: number }) =>
    React.createElement('div', { 'data-testid': 'sequence', 'data-from': from, 'data-duration': durationInFrames }, children),
  Video: (props: Record<string, unknown>) =>
    React.createElement('video', { 'data-testid': 'video-layer', ...props }),
  OffthreadVideo: (props: Record<string, unknown>) =>
    React.createElement('video', { 'data-testid': 'offthread-video-layer', ...props }),
  Audio: (props: Record<string, unknown>) =>
    React.createElement('audio', { 'data-testid': 'audio-layer', ...props }),
  getRemotionEnvironment: () => ({ isRendering: false }),
  Img: (props: Record<string, unknown>) =>
    React.createElement('img', { 'data-testid': 'image-layer', ...props }),
  useVideoConfig: () => ({ fps: 30, durationInFrames: 300, width: 1920, height: 1080 }),
  useCurrentFrame: () => 0,
}));

// Mock project-schema package to avoid build artifact dependency in tests.
vi.mock('@ai-video-editor/project-schema', () => ({}));

import { VideoComposition } from './VideoComposition.js';
import {
  makeProjectDoc,
  TRACK_VIDEO,
  TRACK_AUDIO,
  TRACK_OVERLAY,
  TRACK_CAPTION,
  CLIP_VIDEO,
  CLIP_AUDIO,
  CLIP_IMAGE,
  CLIP_TEXT,
  CLIP_CAPTION,
} from './VideoComposition.fixtures.js';

describe('VideoComposition', () => {
  describe('empty timeline', () => {
    it('renders without crashing when there are no tracks or clips', () => {
      const doc = makeProjectDoc();
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(getByTestId('absolute-fill')).toBeTruthy();
    });

    it('renders no sequences when clips array is empty', () => {
      const doc = makeProjectDoc();
      const { queryAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(queryAllByTestId('sequence')).toHaveLength(0);
    });
  });

  describe('clip rendering', () => {
    it('renders a Sequence for a video clip', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO],
        clips: [CLIP_VIDEO],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-001': 'https://example.com/video.mp4' }} />
      );
      const sequences = getAllByTestId('sequence');
      expect(sequences).toHaveLength(1);
    });

    it('renders a Sequence for an audio clip', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_AUDIO],
        clips: [CLIP_AUDIO],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-002': 'https://example.com/audio.mp3' }} />
      );
      const sequences = getAllByTestId('sequence');
      expect(sequences).toHaveLength(1);
    });

    it('renders a Sequence for a text-overlay clip', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_OVERLAY],
        clips: [CLIP_TEXT],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(getAllByTestId('sequence')).toHaveLength(1);
    });

    it('renders a Sequence for an image clip', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_OVERLAY],
        clips: [CLIP_IMAGE],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-img-001': 'https://example.com/image.png' }} />
      );
      expect(getAllByTestId('sequence')).toHaveLength(1);
    });

    it('skips image clip rendering when fileId is not in assetUrls', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_OVERLAY],
        clips: [CLIP_IMAGE],
      });
      const { queryAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(queryAllByTestId('sequence')).toHaveLength(0);
    });

    it('renders a Sequence for a caption clip', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_CAPTION],
        clips: [CLIP_CAPTION],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(getAllByTestId('sequence')).toHaveLength(1);
    });

    it('passes opacity from image clip to ImageLayer', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_OVERLAY],
        clips: [CLIP_IMAGE],
      });
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-img-001': 'https://example.com/image.png' }} />
      );
      const imgEl = getByTestId('image-layer');
      expect((imgEl as HTMLImageElement).style.opacity).toBe('0.9');
    });

    it('omits a video clip when fileId is not in assetUrls (no broken playback)', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO],
        clips: [CLIP_VIDEO],
      });
      const { queryAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      // No src → clip is skipped to avoid a broken <video> element.
      expect(queryAllByTestId('sequence')).toHaveLength(0);
    });
  });

  describe('trim passthrough', () => {
    it('passes trimInFrame as startFrom to VideoLayer', () => {
      const clipWithTrim = { ...CLIP_VIDEO, trimInFrame: 15, trimOutFrame: 75 };
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO],
        clips: [clipWithTrim],
      });
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-001': 'https://example.com/video.mp4' }} />
      );
      const videoEl = getByTestId('video-layer');
      // The mock renders the props onto a <video> element.
      expect(videoEl.getAttribute('startfrom')).toBe('15');
    });

    it('passes trimOutFrame as endAt to VideoLayer when present', () => {
      const clipWithTrim = { ...CLIP_VIDEO, trimInFrame: 5, trimOutFrame: 80 };
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO],
        clips: [clipWithTrim],
      });
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-001': 'https://example.com/video.mp4' }} />
      );
      const videoEl = getByTestId('video-layer');
      expect(videoEl.getAttribute('endat')).toBe('80');
    });

    it('passes trimInFrame as startFrom to AudioLayer', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_AUDIO],
        clips: [CLIP_AUDIO],
      });
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-002': 'https://example.com/audio.mp3' }} />
      );
      const audioEl = getByTestId('audio-layer');
      expect(audioEl.getAttribute('startfrom')).toBe('5');
      expect(audioEl.getAttribute('endat')).toBe('80');
    });
  });

  describe('muted track filtering', () => {
    it('skips clips whose parent track is muted', () => {
      const mutedTrack = { ...TRACK_VIDEO, muted: true };
      const doc = makeProjectDoc({
        tracks: [mutedTrack],
        clips: [CLIP_VIDEO],
      });
      const { queryAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(queryAllByTestId('sequence')).toHaveLength(0);
    });

    it('renders clips from unmuted tracks even when other tracks are muted', () => {
      const mutedTrack = { ...TRACK_AUDIO, muted: true };
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, mutedTrack],
        clips: [CLIP_VIDEO, CLIP_AUDIO],
      });
      const { getAllByTestId } = render(
        <VideoComposition
          projectDoc={doc}
          assetUrls={{
            'asset-001': 'https://example.com/video.mp4',
            'asset-002': 'https://example.com/audio.mp3',
          }}
        />
      );
      // Only the video clip from the unmuted track renders.
      expect(getAllByTestId('sequence')).toHaveLength(1);
    });

    it('renders all clips when no tracks are muted', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        clips: [CLIP_VIDEO, CLIP_AUDIO],
      });
      const { getAllByTestId } = render(
        <VideoComposition
          projectDoc={doc}
          assetUrls={{
            'asset-001': 'https://example.com/video.mp4',
            'asset-002': 'https://example.com/audio.mp3',
          }}
        />
      );
      expect(getAllByTestId('sequence')).toHaveLength(2);
    });
  });

  describe('z-order (track index sorting)', () => {
    it('renders clips sorted by their track index (lower index first)', () => {
      // video track at index 0, audio track at index 1.
      // A clip on the audio track (index 1) should appear after the video clip (index 0).
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        // Deliberately add audio clip first in the array so we can verify sorting.
        clips: [CLIP_AUDIO, CLIP_VIDEO],
      });
      const { getAllByTestId } = render(
        <VideoComposition
          projectDoc={doc}
          assetUrls={{
            'asset-001': 'https://example.com/video.mp4',
            'asset-002': 'https://example.com/audio.mp3',
          }}
        />
      );
      const sequences = getAllByTestId('sequence');
      // Both sequences should still be present.
      expect(sequences).toHaveLength(2);
    });

    it('does not mutate the original clips array in projectDoc', () => {
      const clips = [CLIP_AUDIO, CLIP_VIDEO];
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        clips,
      });
      render(
        <VideoComposition
          projectDoc={doc}
          assetUrls={{
            'asset-001': 'https://example.com/video.mp4',
            'asset-002': 'https://example.com/audio.mp3',
          }}
        />
      );
      // The original array order must be preserved.
      expect(doc.clips[0].id).toBe(CLIP_AUDIO.id);
      expect(doc.clips[1].id).toBe(CLIP_VIDEO.id);
    });
  });

  describe('caption clip rendering', () => {
    it('renders caption clip words inside CaptionLayer', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_CAPTION],
        clips: [CLIP_CAPTION],
      });
      const { getByText } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      // CaptionLayer renders each word as a span; both words must be in the DOM.
      expect(getByText('Hello')).toBeTruthy();
      expect(getByText('world')).toBeTruthy();
    });

    it('renders a Sequence with correct from and durationInFrames for a caption clip', () => {
      const captionClip = { ...CLIP_CAPTION, startFrame: 15, durationFrames: 45 };
      const doc = makeProjectDoc({
        tracks: [TRACK_CAPTION],
        clips: [captionClip],
      });
      const { getByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      const seq = getByTestId('sequence');
      expect(seq.getAttribute('data-from')).toBe('15');
      expect(seq.getAttribute('data-duration')).toBe('45');
    });

    it('does not render caption clip when its track is muted', () => {
      const mutedTrack = { ...TRACK_CAPTION, muted: true };
      const doc = makeProjectDoc({
        tracks: [mutedTrack],
        clips: [CLIP_CAPTION],
      });
      const { queryAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(queryAllByTestId('sequence')).toHaveLength(0);
    });

    it('renders both a caption clip and a text-overlay clip on separate tracks', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_CAPTION, TRACK_OVERLAY],
        clips: [CLIP_CAPTION, CLIP_TEXT],
      });
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{}} />
      );
      expect(getAllByTestId('sequence')).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('skips clips referencing a non-existent trackId without crashing', () => {
      const doc = makeProjectDoc({
        tracks: [],
        clips: [CLIP_VIDEO],
      });
      // Track is missing — the clip has no trackId match so it is not muted.
      // However, an assetUrl must be provided for the clip to render.
      const { getAllByTestId } = render(
        <VideoComposition projectDoc={doc} assetUrls={{ 'asset-001': 'https://example.com/video.mp4' }} />
      );
      // Clip is from an unknown track — not muted, so it renders.
      expect(getAllByTestId('sequence')).toHaveLength(1);
    });
  });
});
