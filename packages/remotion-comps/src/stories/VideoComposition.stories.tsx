import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Player } from '@remotion/player';
import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { VideoComposition } from '../compositions/VideoComposition.js';

// ---------------------------------------------------------------------------
// Asset URL stubs
//
// Stories run without a backend. We use a small publicly accessible royalty-
// free MP4 from the Blender Foundation (hosted on archive.org) as the stub
// video URL. For the audio story we reuse the same MP4 (it contains audio).
// Image stories use a data-URI placeholder.
//
// If Storybook's static server is running (`--static-dir ./public`), local
// files under `packages/remotion-comps/public/` can also be referenced as
// `/stub-video.mp4` etc.
// ---------------------------------------------------------------------------
const STUB_VIDEO_URL =
  'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';
const STUB_AUDIO_URL = STUB_VIDEO_URL; // reuse — any media file with audio works

// ---------------------------------------------------------------------------
// Stub fileIds — must be valid UUIDs to satisfy the clip schema, and must
// match the keys in the assetUrls map passed to the same story.
// ---------------------------------------------------------------------------
const FILE_ID_VIDEO = '11111111-1111-1111-1111-111111111111';
const FILE_ID_AUDIO = '22222222-2222-2222-2222-222222222222';

const NOW = new Date().toISOString();

function makeDoc(overrides: Partial<ProjectDoc>): ProjectDoc {
  return {
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Storybook Preview',
    fps: 30,
    durationFrames: 150,
    width: 1280,
    height: 720,
    tracks: [],
    clips: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProjectDoc;
}

// ---------------------------------------------------------------------------
// Shared Player wrapper — used by every story.
// ---------------------------------------------------------------------------
interface PlayerWrapperProps {
  projectDoc: ProjectDoc;
  assetUrls: Record<string, string>;
}

function PlayerWrapper({ projectDoc, assetUrls }: PlayerWrapperProps): React.ReactElement {
  return (
    <Player
      component={VideoComposition}
      inputProps={{ projectDoc, assetUrls }}
      fps={projectDoc.fps}
      durationInFrames={projectDoc.durationFrames}
      compositionWidth={projectDoc.width}
      compositionHeight={projectDoc.height}
      style={{ width: '100%', aspectRatio: `${projectDoc.width} / ${projectDoc.height}` }}
      controls
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
const meta: Meta<typeof PlayerWrapper> = {
  title: 'Compositions/VideoComposition',
  component: PlayerWrapper,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof PlayerWrapper>;

// ---------------------------------------------------------------------------
// Story: Empty timeline
// ---------------------------------------------------------------------------
export const EmptyTimeline: Story = {
  name: 'Empty timeline',
  args: {
    projectDoc: makeDoc({ tracks: [], clips: [] }),
    assetUrls: {},
  },
};

// ---------------------------------------------------------------------------
// Story: Single video clip
// ---------------------------------------------------------------------------
export const SingleVideoClip: Story = {
  name: 'Single video clip',
  args: {
    projectDoc: makeDoc({
      tracks: [{ id: 'track-1', type: 'video', name: 'Video 1', muted: false, locked: false }],
      clips: [
        {
          id: 'clip-1',
          type: 'video',
          fileId: FILE_ID_VIDEO,
          trackId: 'track-1',
          startFrame: 0,
          durationFrames: 150,
          trimInFrame: 0,
          trimOutFrame: undefined,
          opacity: 1,
          volume: 1,
        },
      ],
    }),
    assetUrls: { [FILE_ID_VIDEO]: STUB_VIDEO_URL },
  },
};

// ---------------------------------------------------------------------------
// Story: Audio + video together
// ---------------------------------------------------------------------------
export const AudioAndVideo: Story = {
  name: 'Audio + video together',
  args: {
    projectDoc: makeDoc({
      tracks: [
        { id: 'track-video', type: 'video', name: 'Video 1', muted: false, locked: false },
        { id: 'track-audio', type: 'audio', name: 'Audio 1', muted: false, locked: false },
      ],
      clips: [
        {
          id: 'clip-video',
          type: 'video',
          fileId: FILE_ID_VIDEO,
          trackId: 'track-video',
          startFrame: 0,
          durationFrames: 150,
          trimInFrame: 0,
          trimOutFrame: undefined,
          opacity: 1,
          volume: 1,
        },
        {
          id: 'clip-audio',
          type: 'audio',
          fileId: FILE_ID_AUDIO,
          trackId: 'track-audio',
          startFrame: 0,
          durationFrames: 90,
          trimInFrame: 0,
          trimOutFrame: undefined,
          volume: 0.8,
        },
      ],
    }),
    assetUrls: {
      [FILE_ID_VIDEO]: STUB_VIDEO_URL,
      [FILE_ID_AUDIO]: STUB_AUDIO_URL,
    },
  },
};

// ---------------------------------------------------------------------------
// Story: Overlapping clips (two video clips on separate tracks)
// ---------------------------------------------------------------------------
export const OverlappingClips: Story = {
  name: 'Overlapping clips',
  args: {
    projectDoc: makeDoc({
      tracks: [
        { id: 'track-a', type: 'video', name: 'Video A', muted: false, locked: false },
        { id: 'track-b', type: 'video', name: 'Video B', muted: false, locked: false },
      ],
      clips: [
        {
          id: 'clip-a',
          type: 'video',
          fileId: FILE_ID_VIDEO,
          trackId: 'track-a',
          startFrame: 0,
          durationFrames: 120,
          trimInFrame: 0,
          trimOutFrame: undefined,
          opacity: 1,
          volume: 0,
        },
        {
          id: 'clip-b',
          type: 'video',
          fileId: FILE_ID_VIDEO,
          trackId: 'track-b',
          startFrame: 30,
          durationFrames: 90,
          trimInFrame: 0,
          trimOutFrame: undefined,
          opacity: 0.6,
          volume: 0,
        },
      ],
    }),
    assetUrls: { [FILE_ID_VIDEO]: STUB_VIDEO_URL },
  },
};

// ---------------------------------------------------------------------------
// Story: Text overlay
// ---------------------------------------------------------------------------
export const TextOverlay: Story = {
  name: 'Text overlay',
  args: {
    projectDoc: makeDoc({
      tracks: [
        { id: 'track-video', type: 'video', name: 'Video 1', muted: false, locked: false },
        { id: 'track-overlay', type: 'overlay', name: 'Overlay 1', muted: false, locked: false },
      ],
      clips: [
        {
          id: 'clip-video',
          type: 'video',
          fileId: FILE_ID_VIDEO,
          trackId: 'track-video',
          startFrame: 0,
          durationFrames: 150,
          trimInFrame: 0,
          trimOutFrame: undefined,
          opacity: 1,
          volume: 0,
        },
        {
          id: 'clip-text',
          type: 'text-overlay',
          trackId: 'track-overlay',
          startFrame: 15,
          durationFrames: 90,
          text: 'ClipTale Preview',
          fontSize: 48,
          color: '#F0F0FA',
          position: 'bottom' as const,
        },
      ],
    }),
    assetUrls: { [FILE_ID_VIDEO]: STUB_VIDEO_URL },
  },
};
