import { randomUUID } from 'node:crypto';

import { describe, it, expect } from 'vitest';

import { computeProjectDuration } from './index.js';
import type { Clip } from '@ai-video-editor/project-schema';

const fps = 30;

function makeVideoClip(startFrame: number, durationFrames: number): Clip {
  return {
    id: randomUUID(),
    type: 'video',
    fileId: randomUUID(),
    trackId: randomUUID(),
    startFrame,
    durationFrames,
    trimInFrame: 0,
    opacity: 1,
    volume: 1,
  };
}

function makeAudioClip(startFrame: number, durationFrames: number): Clip {
  return {
    id: randomUUID(),
    type: 'audio',
    fileId: randomUUID(),
    trackId: randomUUID(),
    startFrame,
    durationFrames,
    trimInFrame: 0,
    volume: 1,
  };
}

function makeImageClip(startFrame: number, durationFrames: number): Clip {
  return {
    id: randomUUID(),
    type: 'image',
    fileId: randomUUID(),
    trackId: randomUUID(),
    startFrame,
    durationFrames,
    opacity: 1,
  };
}

describe('computeProjectDuration', () => {
  it('should return the minimum floor when clips array is empty', () => {
    expect(computeProjectDuration([], fps)).toBe(fps * 5);
  });

  it('should use a custom minSeconds floor when provided', () => {
    expect(computeProjectDuration([], fps, 10)).toBe(fps * 10);
  });

  it('should return the end frame of a single clip when it exceeds the minimum', () => {
    const clips = [makeVideoClip(0, 300)]; // 10 seconds at 30fps
    expect(computeProjectDuration(clips, fps)).toBe(300);
  });

  it('should return the minimum floor when a single clip ends before it', () => {
    const clips = [makeVideoClip(0, 60)]; // 2 seconds — below 5 second minimum
    expect(computeProjectDuration(clips, fps)).toBe(fps * 5);
  });

  it('should return the furthest clip end frame across multiple clips', () => {
    const clips = [
      makeVideoClip(0, 90),   // ends at frame 90
      makeVideoClip(60, 120), // ends at frame 180
      makeVideoClip(30, 60),  // ends at frame 90
    ];
    expect(computeProjectDuration(clips, fps)).toBe(180);
  });

  it('should account for clip startFrame when computing end frame', () => {
    const clips = [
      makeVideoClip(200, 50), // ends at frame 250 — further than next
      makeVideoClip(0, 200),  // ends at frame 200
    ];
    expect(computeProjectDuration(clips, fps)).toBe(250);
  });

  it('should handle clips of mixed types (video, audio, image)', () => {
    const clips = [
      makeVideoClip(0, 90),    // ends at 90
      makeAudioClip(0, 150),   // ends at 150
      makeImageClip(100, 100), // ends at 200
    ];
    expect(computeProjectDuration(clips, fps)).toBe(200);
  });

  it('should return the floor when all clips end before the minimum', () => {
    const clips = [makeImageClip(0, 30)]; // ends at frame 30, below 5s floor (150)
    expect(computeProjectDuration(clips, fps, 5)).toBe(fps * 5);
  });

  it('should return exactly the end frame when it matches the minimum', () => {
    const clips = [makeVideoClip(0, fps * 5)]; // exactly 5 seconds
    expect(computeProjectDuration(clips, fps)).toBe(fps * 5);
  });

  it('should compute the minimum floor using the provided fps value, not a hardcoded constant', () => {
    // At 24fps, minSeconds=5 → floor is 120 frames (not 150 as it would be at 30fps)
    expect(computeProjectDuration([], 24, 5)).toBe(120);
    expect(computeProjectDuration([], 24, 10)).toBe(240);
  });
});
