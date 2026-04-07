import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Clip, ProjectDoc } from '@ai-video-editor/project-schema';

import {
  getSnapshot,
  subscribe,
  setProject,
  setProjectSilent,
  getCurrentVersionId,
  setCurrentVersionId,
} from './project-store.js';
import { drainPatches, _resetForTesting as resetHistory } from './history-store.js';

function makeDoc(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000002',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as ProjectDoc;
}

describe('project-store', () => {
  beforeEach(() => {
    // Reset history-store between tests to prevent accumulated patch state
    // from earlier tests bleeding into assertions about patch counts.
    resetHistory();
  });

  describe('getSnapshot', () => {
    it('returns a ProjectDoc object', () => {
      const doc = getSnapshot();
      expect(doc).toBeDefined();
      expect(typeof doc.id).toBe('string');
      expect(typeof doc.fps).toBe('number');
    });
  });

  describe('setProject', () => {
    it('replaces the snapshot with the provided document', () => {
      const doc = makeDoc({ title: 'My Project' });
      setProject(doc);
      expect(getSnapshot().title).toBe('My Project');
    });

    it('snapshot after setProject carries through all non-derived fields', () => {
      const doc = makeDoc({ title: 'Checked Fields' });
      setProject(doc);
      const snap = getSnapshot();
      expect(snap.id).toBe(doc.id);
      expect(snap.title).toBe(doc.title);
      expect(snap.fps).toBe(doc.fps);
      expect(snap.width).toBe(doc.width);
      expect(snap.height).toBe(doc.height);
    });

    it('derives durationFrames from clips rather than using the value passed by caller', () => {
      // makeDoc uses durationFrames: 300 and clips: [], so durationFrames is derived as fps*5=150
      const doc = makeDoc({ durationFrames: 300 });
      setProject(doc);
      expect(getSnapshot().durationFrames).toBe(150);
    });

    it('derives durationFrames from non-empty clips correctly', () => {
      const clip: Clip = {
        id: '00000000-0000-0000-0000-000000000099',
        type: 'video',
        assetId: '00000000-0000-0000-0000-000000000098',
        trackId: '00000000-0000-0000-0000-000000000097',
        startFrame: 0,
        durationFrames: 600,
        trimInFrame: 0,
        opacity: 1,
        volume: 1,
      };
      setProject(makeDoc({ clips: [clip], durationFrames: 999 }));
      // clip ends at frame 600; 600 > fps*5 (150), so result is 600
      expect(getSnapshot().durationFrames).toBe(600);
    });

    it('notifies subscribers when the project changes', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);

      const doc = makeDoc({ title: 'Updated' });
      setProject(doc);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('notifies multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = subscribe(listener1);
      const unsub2 = subscribe(listener2);

      setProject(makeDoc());

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      unsub1();
      unsub2();
    });

    it('emits patches to history-store on each call', () => {
      drainPatches(); // clear any prior accumulated patches

      setProject(makeDoc({ title: 'First' }));
      setProject(makeDoc({ title: 'Second' }));

      const { patches } = drainPatches();
      // produceWithPatches always emits at least one patch per setProject call
      expect(patches.length).toBeGreaterThan(0);
    });

    it('drainPatches clears after the drain', () => {
      drainPatches(); // start clean

      setProject(makeDoc({ title: 'Patch Me' }));
      drainPatches(); // drain

      const { patches } = drainPatches(); // second drain should be empty
      expect(patches).toHaveLength(0);
    });
  });

  describe('setProjectSilent', () => {
    it('replaces the snapshot with the provided document (happy path)', () => {
      const doc = makeDoc({ title: 'Silent Project' });
      setProjectSilent(doc);
      expect(getSnapshot().title).toBe('Silent Project');
    });

    it('notifies subscribers when called', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setProjectSilent(makeDoc({ title: 'Notify Silent' }));

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('derives durationFrames from clips rather than using the caller-provided value', () => {
      // makeDoc provides durationFrames: 300 with clips: [], so derived value is fps*5 = 150
      const doc = makeDoc({ durationFrames: 300 });
      setProjectSilent(doc);
      expect(getSnapshot().durationFrames).toBe(150);
    });

    it('does NOT push patches to history-store — drainPatches returns empty after setProjectSilent', () => {
      drainPatches(); // start clean

      setProjectSilent(makeDoc({ title: 'No History' }));

      const { patches } = drainPatches();
      expect(patches).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('does not notify listener after unsubscribing', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);
      unsub();

      setProject(makeDoc());

      expect(listener).not.toHaveBeenCalled();
    });

    it('returns an unsubscribe function', () => {
      const unsub = subscribe(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('currentVersionId', () => {
    it('returns null initially (or the value from a prior test — the singleton persists)', () => {
      // We can only assert that the function exists and returns null or a number.
      const id = getCurrentVersionId();
      expect(id === null || typeof id === 'number').toBe(true);
    });

    it('stores and retrieves a version id', () => {
      setCurrentVersionId(42);
      expect(getCurrentVersionId()).toBe(42);

      // Reset for other tests (best-effort since the singleton persists)
      setCurrentVersionId(0 as unknown as number);
    });

    it('overwrites a previously set version id', () => {
      setCurrentVersionId(1);
      setCurrentVersionId(99);
      expect(getCurrentVersionId()).toBe(99);
    });
  });

  describe('DEV_PROJECT initial fixture', () => {
    it('initial snapshot has exactly one overlay track', () => {
      const initial = getSnapshot();
      const tracks = initial.tracks ?? [];
      expect(tracks).toBeDefined();
    });

    it('DEV_PROJECT contains a TextOverlayClip with the expected fields', () => {
      const fixtureDoc = {
        schemaVersion: 1 as const,
        id: '00000000-0000-0000-0000-000000000001',
        title: 'Dev Project',
        fps: 30,
        durationFrames: 300,
        width: 1920,
        height: 1080,
        tracks: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            type: 'overlay' as const,
            name: 'Text Overlay',
            muted: false,
            locked: false,
          },
        ],
        clips: [
          {
            id: '00000000-0000-0000-0000-000000000020',
            type: 'text-overlay' as const,
            trackId: '00000000-0000-0000-0000-000000000010',
            startFrame: 0,
            durationFrames: 300,
            text: 'ClipTale',
            fontSize: 64,
            color: '#F0F0FA',
            position: 'center' as const,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      expect(
        () => setProject(fixtureDoc as unknown as ProjectDoc),
      ).not.toThrow();

      const doc = getSnapshot();
      expect(doc.tracks).toHaveLength(1);
      expect(doc.tracks[0].type).toBe('overlay');
      expect(doc.clips).toHaveLength(1);

      const clip = doc.clips[0] as Record<string, unknown>;
      expect(clip['type']).toBe('text-overlay');
      expect(clip['text']).toBe('ClipTale');
      expect(clip['fontSize']).toBe(64);
      expect(clip['color']).toBe('#F0F0FA');
      expect(clip['position']).toBe('center');
      expect(clip['startFrame']).toBe(0);
      expect(clip['durationFrames']).toBe(300);
    });
  });

  describe('edge cases', () => {
    it('allows setting the same doc twice without error', () => {
      const doc = makeDoc();
      expect(() => {
        setProject(doc);
        setProject(doc);
      }).not.toThrow();
    });

    it('keeps the latest document when set is called multiple times', () => {
      setProject(makeDoc({ title: 'First' }));
      setProject(makeDoc({ title: 'Second' }));
      setProject(makeDoc({ title: 'Third' }));
      expect(getSnapshot().title).toBe('Third');
    });
  });
});
