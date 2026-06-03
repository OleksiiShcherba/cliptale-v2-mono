/**
 * T19 — tests for useFlowAutosave
 *
 * Covers (AC-10b):
 * - An edit triggers a debounced save carrying the current parent version.
 * - On success the local version is bumped to the server-returned version.
 * - On 409 conflict the hook sets a conflict state (reload-prompt) and does NOT
 *   silently retry / clobber.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  saveCanvas: vi.fn(),
}));

import { useFlowAutosave } from './useFlowAutosave';
import { saveCanvas } from '../api';
import type { FlowCanvas } from '@ai-video-editor/project-schema';

const mockSaveCanvas = vi.mocked(saveCanvas);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const FLOW_ID = 'flow-abc';
const INITIAL_VERSION = 3;

const EMPTY_CANVAS: FlowCanvas = { blocks: [], edges: [] };

function makeCanvas(seed: number): FlowCanvas {
  return {
    blocks: [
      {
        blockId: `block-${seed}`,
        type: 'content',
        position: { x: seed * 10, y: 0 },
        params: { contentType: 'text', text: `hello ${seed}`, modality: 'text' },
      },
    ],
    edges: [],
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockSaveCanvas.mockResolvedValue({
    flowId: FLOW_ID,
    version: INITIAL_VERSION + 1,
    updatedAt: new Date().toISOString(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useFlowAutosave', () => {
  describe('debounced save carries the parent version', () => {
    it('does NOT call saveCanvas immediately on canvas change', () => {
      const { rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });

      expect(mockSaveCanvas).not.toHaveBeenCalled();
    });

    it('calls saveCanvas after the debounce window with the current parent version', async () => {
      const { rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });

      await act(async () => {
        vi.advanceTimersByTime(1000); // ≥ debounce window (must be ≤ 800 ms per AC)
        await Promise.resolve();
      });

      expect(mockSaveCanvas).toHaveBeenCalledTimes(1);
      expect(mockSaveCanvas).toHaveBeenCalledWith(FLOW_ID, {
        version: INITIAL_VERSION,
        canvas: makeCanvas(1),
      });
    });

    it('collapses rapid canvas changes into a single save', async () => {
      const { rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });
      rerender({ canvas: makeCanvas(2) });
      rerender({ canvas: makeCanvas(3) });

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(mockSaveCanvas).toHaveBeenCalledTimes(1);
    });
  });

  describe('success path — version bump', () => {
    it('bumps the local version to the server-returned version after a successful save', async () => {
      const serverVersion = INITIAL_VERSION + 1;
      mockSaveCanvas.mockResolvedValue({
        flowId: FLOW_ID,
        version: serverVersion,
        updatedAt: new Date().toISOString(),
      });

      const { result, rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      expect(result.current.localVersion).toBe(INITIAL_VERSION);

      rerender({ canvas: makeCanvas(1) });

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve(); // flush state update
      });

      expect(result.current.localVersion).toBe(serverVersion);
    });

    it('uses the bumped version for the next save', async () => {
      const serverVersion = INITIAL_VERSION + 1;
      mockSaveCanvas.mockResolvedValue({
        flowId: FLOW_ID,
        version: serverVersion,
        updatedAt: new Date().toISOString(),
      });

      const { rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      // First save
      rerender({ canvas: makeCanvas(1) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockSaveCanvas).toHaveBeenCalledTimes(1);

      // Second save — must carry the bumped version
      mockSaveCanvas.mockResolvedValue({
        flowId: FLOW_ID,
        version: serverVersion + 1,
        updatedAt: new Date().toISOString(),
      });
      rerender({ canvas: makeCanvas(2) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockSaveCanvas).toHaveBeenCalledTimes(2);
      expect(mockSaveCanvas).toHaveBeenNthCalledWith(2, FLOW_ID, {
        version: serverVersion,
        canvas: makeCanvas(2),
      });
    });
  });

  describe('409 conflict path', () => {
    it('sets conflict state when saveCanvas throws with status 409', async () => {
      const conflictError = Object.assign(new Error('conflict'), { status: 409 });
      mockSaveCanvas.mockRejectedValue(conflictError);

      const { result, rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      expect(result.current.conflict).toBe(false);

      rerender({ canvas: makeCanvas(1) });

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.conflict).toBe(true);
    });

    it('does NOT call saveCanvas again after a 409 conflict (no silent overwrite)', async () => {
      const conflictError = Object.assign(new Error('conflict'), { status: 409 });
      mockSaveCanvas.mockRejectedValue(conflictError);

      const { rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockSaveCanvas).toHaveBeenCalledTimes(1);

      // Another canvas change — must NOT trigger a save in conflict state
      mockSaveCanvas.mockClear();
      rerender({ canvas: makeCanvas(2) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(mockSaveCanvas).not.toHaveBeenCalled();
    });

    it('does not change the local version after a 409', async () => {
      const conflictError = Object.assign(new Error('conflict'), { status: 409 });
      mockSaveCanvas.mockRejectedValue(conflictError);

      const { result, rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.localVersion).toBe(INITIAL_VERSION);
    });
  });

  describe('status field', () => {
    it('starts as idle', () => {
      const { result } = renderHook(() =>
        useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas: EMPTY_CANVAS }),
      );
      expect(result.current.status).toBe('idle');
    });

    it('is "saving" during an in-progress save', async () => {
      mockSaveCanvas.mockImplementation(() => new Promise(() => undefined));

      const { result, rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saving');
    });

    it('is "saved" after a successful save', async () => {
      const { result, rerender } = renderHook(
        ({ canvas }: { canvas: FlowCanvas }) =>
          useFlowAutosave({ flowId: FLOW_ID, version: INITIAL_VERSION, canvas }),
        { initialProps: { canvas: EMPTY_CANVAS } },
      );

      rerender({ canvas: makeCanvas(1) });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saved');
    });
  });
});
