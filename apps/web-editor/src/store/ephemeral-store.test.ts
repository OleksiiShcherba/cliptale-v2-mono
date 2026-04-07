import { describe, it, expect, vi } from 'vitest';

import {
  getSnapshot,
  subscribe,
  setPlayheadFrame,
  setSelectedClips,
  setZoom,
  setPxPerFrame,
  setScrollOffsetX,
  setVolume,
  setMuted,
} from './ephemeral-store.js';

describe('ephemeral-store', () => {
  describe('getSnapshot', () => {
    it('returns an object with playheadFrame, selectedClipIds, and zoom', () => {
      const state = getSnapshot();
      expect(typeof state.playheadFrame).toBe('number');
      expect(Array.isArray(state.selectedClipIds)).toBe(true);
      expect(typeof state.zoom).toBe('number');
    });
  });

  describe('setPlayheadFrame', () => {
    it('updates playheadFrame in the snapshot', () => {
      setPlayheadFrame(42);
      expect(getSnapshot().playheadFrame).toBe(42);
    });

    it('notifies subscribers when frame changes', () => {
      setPlayheadFrame(0);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setPlayheadFrame(10);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify subscribers when frame is unchanged', () => {
      setPlayheadFrame(5);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setPlayheadFrame(5);

      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it('preserves other fields when only playheadFrame changes', () => {
      setSelectedClips(['clip-1']);
      setZoom(2);
      setPlayheadFrame(99);
      const state = getSnapshot();
      expect(state.selectedClipIds).toEqual(['clip-1']);
      expect(state.zoom).toBe(2);
      expect(state.playheadFrame).toBe(99);
    });
  });

  describe('setSelectedClips', () => {
    it('updates selectedClipIds in the snapshot', () => {
      setSelectedClips(['clip-a', 'clip-b']);
      expect(getSnapshot().selectedClipIds).toEqual(['clip-a', 'clip-b']);
    });

    it('accepts an empty array to clear selection', () => {
      setSelectedClips(['clip-a']);
      setSelectedClips([]);
      expect(getSnapshot().selectedClipIds).toEqual([]);
    });

    it('notifies subscribers on every call (no skip for same value)', () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setSelectedClips(['clip-a']);
      setSelectedClips(['clip-a']);

      expect(listener).toHaveBeenCalledTimes(2);
      unsub();
    });
  });

  describe('setZoom', () => {
    it('updates zoom in the snapshot', () => {
      setZoom(1.5);
      expect(getSnapshot().zoom).toBe(1.5);
    });

    it('notifies subscribers when zoom changes', () => {
      setZoom(1);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setZoom(2);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify subscribers when zoom is unchanged', () => {
      setZoom(3);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setZoom(3);

      expect(listener).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('setPxPerFrame', () => {
    it('updates pxPerFrame in the snapshot', () => {
      setPxPerFrame(8);
      expect(getSnapshot().pxPerFrame).toBe(8);
    });

    it('clamps pxPerFrame to minimum of 1', () => {
      setPxPerFrame(0);
      expect(getSnapshot().pxPerFrame).toBe(1);
    });

    it('clamps pxPerFrame to maximum of 100', () => {
      setPxPerFrame(200);
      expect(getSnapshot().pxPerFrame).toBe(100);
    });

    it('notifies subscribers when pxPerFrame changes', () => {
      setPxPerFrame(4);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setPxPerFrame(10);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify when pxPerFrame is unchanged', () => {
      setPxPerFrame(5);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setPxPerFrame(5);

      expect(listener).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('setScrollOffsetX', () => {
    it('updates scrollOffsetX in the snapshot', () => {
      setScrollOffsetX(120);
      expect(getSnapshot().scrollOffsetX).toBe(120);
    });

    it('clamps scrollOffsetX to minimum of 0', () => {
      setScrollOffsetX(-50);
      expect(getSnapshot().scrollOffsetX).toBe(0);
    });

    it('notifies subscribers when scrollOffsetX changes', () => {
      setScrollOffsetX(0);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setScrollOffsetX(100);

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify when scrollOffsetX is unchanged', () => {
      setScrollOffsetX(50);
      const listener = vi.fn();
      const unsub = subscribe(listener);

      setScrollOffsetX(50);

      expect(listener).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const unsub = subscribe(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('does not notify after unsubscribing', () => {
      setZoom(1);
      const listener = vi.fn();
      const unsub = subscribe(listener);
      unsub();

      setZoom(4);

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies multiple subscribers', () => {
      setZoom(1);
      const l1 = vi.fn();
      const l2 = vi.fn();
      const u1 = subscribe(l1);
      const u2 = subscribe(l2);

      setZoom(2);

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
      u1();
      u2();
    });
  });

  describe('setVolume', () => {
    it('updates volume in the snapshot', () => {
      setVolume(0.5);
      expect(getSnapshot().volume).toBe(0.5);
    });

    it('clamps volume to minimum of 0', () => {
      setVolume(-0.5);
      expect(getSnapshot().volume).toBe(0);
    });

    it('clamps volume to maximum of 1', () => {
      setVolume(1.5);
      expect(getSnapshot().volume).toBe(1);
    });

    it('notifies subscribers when volume changes', () => {
      setVolume(1);
      const listener = vi.fn();
      const unsub = subscribe(listener);
      setVolume(0.5);
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify when volume is unchanged', () => {
      setVolume(0.8);
      const listener = vi.fn();
      const unsub = subscribe(listener);
      setVolume(0.8);
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it('clears isMuted when volume is set above 0', () => {
      setMuted(true);
      setVolume(0.5);
      expect(getSnapshot().isMuted).toBe(false);
    });
  });

  describe('setMuted', () => {
    it('updates isMuted in the snapshot', () => {
      setMuted(true);
      expect(getSnapshot().isMuted).toBe(true);
      setMuted(false);
      expect(getSnapshot().isMuted).toBe(false);
    });

    it('notifies subscribers when muted state changes', () => {
      setMuted(false);
      const listener = vi.fn();
      const unsub = subscribe(listener);
      setMuted(true);
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('does not notify when muted state is unchanged', () => {
      setMuted(false);
      const listener = vi.fn();
      const unsub = subscribe(listener);
      setMuted(false);
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it('does not change volume when muted', () => {
      setVolume(0.7);
      setMuted(true);
      expect(getSnapshot().volume).toBe(0.7);
    });
  });
});
