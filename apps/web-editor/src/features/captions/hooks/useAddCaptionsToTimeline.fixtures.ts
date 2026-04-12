import type { ProjectDoc, Track, Clip } from '@ai-video-editor/project-schema';

/** A minimal segment without words — produces a TextOverlayClip. */
export const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'Second line' },
];

/** Segments with word-level timestamps — produce CaptionClips. */
export const TEST_SEGMENTS_WITH_WORDS = [
  {
    start: 0.0,
    end: 2.5,
    text: 'Hello world',
    words: [
      { word: 'Hello', start: 0.0, end: 1.0 },
      { word: 'world', start: 1.1, end: 2.5 },
    ],
  },
  {
    start: 2.5,
    end: 5.0,
    text: 'Second line',
    words: [
      { word: 'Second', start: 2.5, end: 3.5 },
      { word: 'line', start: 3.6, end: 5.0 },
    ],
  },
];

/** Builds a minimal ProjectDoc with sensible defaults and optional overrides. */
export function makeProject(fps = 30, overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [] as Track[],
    clips: [] as Clip[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectDoc;
}
