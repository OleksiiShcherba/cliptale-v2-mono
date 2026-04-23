/**
 * StoryboardHistoryPanel — 320px side panel for browsing and restoring
 * server-persisted storyboard snapshots.
 *
 * Shows up to 50 history entries returned by `GET /storyboards/:draftId/history`.
 * Each entry displays a relative timestamp and a "Restore" button. Clicking
 * Restore triggers a `window.confirm` dialog; on confirmation the panel:
 *   1. Calls `restoreFromSnapshot(entry.snapshot)` to apply the snapshot to
 *      the canvas store.
 *   2. Calls `saveStoryboard(draftId, ...)` directly to immediately persist the
 *      restored state (bypassing the 30 s autosave debounce).
 *   3. Calls `onClose()` so the panel collapses.
 *
 * Architecture notes:
 * - Server state is fetched via `useStoryboardHistoryFetch` (React Query).
 * - Canvas mutation goes through `restoreFromSnapshot` store action — never
 *   direct `setState` from a component.
 * - `saveStoryboard` is imported directly from `api.ts`; there is no `flush()`
 *   on `useStoryboardAutosave` that could be called from here.
 */

import React, { useCallback } from 'react';

import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';

import { saveStoryboard } from '../api';
import type { StoryboardHistorySnapshot } from '../api';
import { useStoryboardHistoryFetch } from '../hooks/useStoryboardHistoryFetch';
import { restoreFromSnapshot, getSnapshot } from '../store/storyboard-store';
import type { CanvasSnapshot } from '../store/storyboard-history-store';
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
} from './StoryboardHistoryPanel.styles';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StoryboardHistoryPanelProps {
  /** The generation draft ID used to fetch and restore history. */
  draftId: string;
  /** Called when the panel should close (e.g. close button or after restore). */
  onClose: () => void;
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
}: StoryboardHistoryPanelProps): React.ReactElement {
  const { entries, isLoading, isError } = useStoryboardHistoryFetch(draftId);

  const handleRestore = useCallback(
    async (entry: StoryboardHistorySnapshot): Promise<void> => {
      const confirmed = window.confirm(
        'Restore this snapshot? Your current canvas will be replaced.',
      );
      if (!confirmed) return;

      // entry.snapshot is StoryboardState ({blocks, edges}) from the server.
      // CanvasSnapshot has positions?: optional, so StoryboardState is a valid
      // subset — cast directly without the unsafe double-cast.
      // restoreFromSnapshot falls back to block.positionX/Y when positions absent.
      const snapshot = entry.snapshot as CanvasSnapshot;
      restoreFromSnapshot(snapshot);

      // Immediately persist the restored state to the server so the autosave
      // 30 s debounce does not leave the server stale.
      const { nodes, edges } = getSnapshot();
      const storeState = {
        blocks: nodes.map((n) => {
          if (n.type === 'scene-block') {
            const data = n.data as { block: import('../types').StoryboardBlock };
            return { ...data.block, positionX: n.position.x, positionY: n.position.y };
          }
          return {
            id: n.id,
            draftId,
            blockType: (n.type === 'start' ? 'start' : 'end') as 'start' | 'end',
            name: null,
            prompt: null,
            durationS: 0,
            positionX: n.position.x,
            positionY: n.position.y,
            sortOrder: 0,
            style: null,
            createdAt: '',
            updatedAt: '',
            mediaItems: [],
          };
        }),
        edges: edges.map((e) => ({
          id: e.id,
          draftId,
          sourceBlockId: e.source,
          targetBlockId: e.target,
        })),
      };

      try {
        await saveStoryboard(draftId, storeState);
      } catch (err: unknown) {
        console.error('[StoryboardHistoryPanel] Immediate save after restore failed:', err);
      }

      onClose();
    },
    [draftId, onClose],
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
              onRestore={(e) => void handleRestore(e)}
            />
          ))}
      </div>
    </aside>
  );
}
