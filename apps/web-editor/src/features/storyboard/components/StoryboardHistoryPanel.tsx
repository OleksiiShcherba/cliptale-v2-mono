/**
 * StoryboardHistoryPanel — 320px side panel for browsing and restoring
 * server-persisted storyboard snapshots.
 *
 * Shows up to 50 history entries returned by `GET /storyboards/:draftId/history`.
 * Each entry displays a relative timestamp and a "Restore" button. Clicking
 * Restore triggers a `window.confirm` dialog; on confirmation the panel:
 *   1. Calls `restoreFromSnapshot(entry.snapshot)` to apply the snapshot to
 *      the canvas store (external store).
 *   2. Calls `onRestore(nodes, edges)` with the reconstructed state from the
 *      store so StoryboardPage can sync React state and trigger autosave.
 *   3. Calls `onClose()` so the panel collapses.
 *
 * Architecture notes:
 * - Server state is fetched via `useStoryboardHistoryFetch` (React Query).
 * - Canvas mutation goes through `restoreFromSnapshot` store action — never
 *   direct `setState` from a component.
 * - `onRestore` is a prop supplied by `StoryboardPage`; it bridges the
 *   external store back into React Flow state via `setNodes`/`setEdges`.
 */

import React, { useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';

import type { StoryboardHistorySnapshot } from '../api';
import { useStoryboardHistoryFetch } from '../hooks/useStoryboardHistoryFetch';
import { restoreFromSnapshot, getSnapshot } from '../store/storyboard-store';
import type { CanvasSnapshot } from '../store/storyboard-history-store';
import type { StoryboardBlock } from '../types';
import {
  panelStyle,
  headerStyle,
  headingStyle,
  closeButtonStyle,
  scrollAreaStyle,
  statusTextStyle,
  errorTextStyle,
  entryRowStyle,
  entryMetaStyle,
  timestampStyle,
  restoreButtonStyle,
  minimapContainerStyle,
  thumbnailImgStyle,
  MINIMAP_COLOR_START,
  MINIMAP_COLOR_END,
  MINIMAP_COLOR_SCENE,
} from './StoryboardHistoryPanel.styles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StoryboardHistoryPanelProps {
  /** The generation draft ID used to fetch and restore history. */
  draftId: string;
  /** Called when the panel should close (e.g. close button or after restore). */
  onClose: () => void;
  /**
   * Called after `restoreFromSnapshot` with the reconstructed React Flow nodes
   * and edges read back from the external store. StoryboardPage uses this to
   * sync React state (setNodes / setEdges) and trigger an immediate save.
   */
  onRestore: (nodes: Node[], edges: Edge[]) => void;
}

// ── SnapshotMinimap ────────────────────────────────────────────────────────────

const SVG_WIDTH = 160;
const SVG_HEIGHT = 90;
const MINIMAP_PADDING = 4;
const RECT_SIZE = 8;

interface SnapshotMinimapProps {
  blocks: StoryboardBlock[];
}

/**
 * Renders a 160×90 inline SVG showing each block as a colored rectangle
 * scaled to fit within the viewport with 4 px padding.
 *
 * Color coding: START = green (#10B981), END = orange (#F59E0B), SCENE = purple (#7C3AED).
 *
 * Degenerate cases (0 blocks or all blocks at same position) render without
 * crashing: 0 blocks → empty box; all-same-position → centered rectangles.
 */
export function SnapshotMinimap({ blocks }: SnapshotMinimapProps): React.ReactElement {
  const rects = React.useMemo(() => {
    if (blocks.length === 0) return [];

    const xs = blocks.map((b) => b.positionX);
    const ys = blocks.map((b) => b.positionY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Available space after padding.
    const availW = SVG_WIDTH - MINIMAP_PADDING * 2 - RECT_SIZE;
    const availH = SVG_HEIGHT - MINIMAP_PADDING * 2 - RECT_SIZE;

    // When all blocks share the same position, range is 0 — prevent division by zero
    // by treating them as centered.
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // When all blocks are at the same coordinates (rangeX===1 from fallback),
    // normalizing produces values ~0 → center them explicitly.
    const allSamePos = maxX === minX && maxY === minY;

    return blocks.map((b) => {
      let nx: number;
      let ny: number;

      if (allSamePos) {
        // Center the overlapping rects.
        nx = (SVG_WIDTH - RECT_SIZE) / 2;
        ny = (SVG_HEIGHT - RECT_SIZE) / 2;
      } else {
        nx = MINIMAP_PADDING + ((b.positionX - minX) / rangeX) * availW;
        ny = MINIMAP_PADDING + ((b.positionY - minY) / rangeY) * availH;
      }

      const fill =
        b.blockType === 'start'
          ? MINIMAP_COLOR_START
          : b.blockType === 'end'
            ? MINIMAP_COLOR_END
            : MINIMAP_COLOR_SCENE;

      return { id: b.id, x: nx, y: ny, fill };
    });
  }, [blocks]);

  return (
    <div style={minimapContainerStyle} data-testid="snapshot-minimap">
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        aria-hidden="true"
      >
        {rects.map((r) => (
          <rect
            key={r.id}
            x={r.x}
            y={r.y}
            width={RECT_SIZE}
            height={RECT_SIZE}
            fill={r.fill}
            rx={4}
            data-testid="minimap-block-rect"
          />
        ))}
      </svg>
    </div>
  );
}

// ── HistoryEntryRow ────────────────────────────────────────────────────────────

interface HistoryEntryRowProps {
  entry: StoryboardHistorySnapshot;
  onRestore: (entry: StoryboardHistorySnapshot) => void;
}

function HistoryEntryRow({ entry, onRestore }: HistoryEntryRowProps): React.ReactElement {
  const relativeTime = formatRelativeDate(new Date(entry.createdAt));
  const absoluteTime = new Date(entry.createdAt).toISOString();

  return (
    <div style={entryRowStyle} data-testid="history-entry-row">
      {entry.snapshot.thumbnail ? (
        <img
          src={entry.snapshot.thumbnail}
          style={thumbnailImgStyle}
          alt="snapshot"
          data-testid="snapshot-thumbnail-img"
        />
      ) : (
        <SnapshotMinimap blocks={entry.snapshot.blocks ?? []} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={entryMetaStyle}>
          <span
            style={timestampStyle}
            title={absoluteTime}
            data-testid="history-entry-timestamp"
          >
            {relativeTime}
          </span>
        </div>
        <button
          type="button"
          style={restoreButtonStyle}
          onClick={() => onRestore(entry)}
          aria-label={`Restore snapshot saved ${relativeTime}`}
          data-testid="history-restore-button"
        >
          Restore
        </button>
      </div>
    </div>
  );
}

// ── StoryboardHistoryPanel ─────────────────────────────────────────────────────

/**
 * Side panel (320px) listing the last 50 server-persisted storyboard snapshots.
 * Supports loading, error, and empty states per architecture-rules §8.
 */
export function StoryboardHistoryPanel({
  draftId,
  onClose,
  onRestore,
}: StoryboardHistoryPanelProps): React.ReactElement {
  const { entries, isLoading, isError } = useStoryboardHistoryFetch(draftId);

  const handleRestore = useCallback(
    (entry: StoryboardHistorySnapshot): void => {
      const confirmed = window.confirm(
        'Restore this snapshot? Your current canvas will be replaced.',
      );
      if (!confirmed) return;

      // entry.snapshot is StoryboardHistoryPayload ({blocks, edges, thumbnail?}).
      // CanvasSnapshot is structurally compatible (adds positions?/thumbnail?) —
      // cast directly without unsafe double-cast.
      // restoreFromSnapshot falls back to block.positionX/Y when positions absent.
      const snapshot = entry.snapshot as CanvasSnapshot;
      restoreFromSnapshot(snapshot);

      // Read back the reconstructed React Flow state from the external store and
      // hand it to StoryboardPage via onRestore. StoryboardPage is responsible for
      // syncing React state (setNodes/setEdges), pushing the history snapshot, and
      // triggering an immediate save — keeping component concerns separated.
      const { nodes: storeNodes, edges: storeEdges } = getSnapshot();
      onRestore(storeNodes, storeEdges);

      onClose();
    },
    [onClose, onRestore],
  );

  return (
    <aside style={panelStyle} aria-label="Storyboard history" data-testid="storyboard-history-panel">
      {/* ── Header ── */}
      <div style={headerStyle}>
        <h2 style={headingStyle} data-testid="history-panel-title">
          History
        </h2>
        <button
          type="button"
          style={closeButtonStyle}
          onClick={onClose}
          aria-label="Close history panel"
          data-testid="history-close-button"
        >
          &times;
        </button>
      </div>

      {/* ── Content ── */}
      <div style={scrollAreaStyle}>
        {isLoading && (
          <p style={statusTextStyle} data-testid="history-loading">
            Loading history…
          </p>
        )}

        {isError && !isLoading && (
          <p style={errorTextStyle} data-testid="history-error">
            Failed to load history.
          </p>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <p style={statusTextStyle} data-testid="history-empty">
            No history yet.
          </p>
        )}

        {!isLoading &&
          !isError &&
          entries.map((entry, index) => (
            <HistoryEntryRow
              key={`${entry.createdAt}-${index}`}
              entry={entry}
              onRestore={handleRestore}
            />
          ))}
      </div>
    </aside>
  );
}
