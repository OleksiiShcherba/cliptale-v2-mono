import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { listTrash, restoreTrashItem } from './api';
import type { TrashItem } from './api';
import { trashPanelStyles as styles } from './trashPanel.styles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable relative timestamp — e.g. "2 hours ago". */
function formatDeletedAt(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// TrashRow — a single item with a Restore button
// ---------------------------------------------------------------------------

interface TrashRowProps {
  item: TrashItem;
  onRestored: () => void;
}

function TrashRow({ item, onRestored }: TrashRowProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [restoreError, setRestoreError] = React.useState<string | null>(null);

  const { mutate: doRestore, isPending } = useMutation({
    mutationFn: () => restoreTrashItem(item),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      void queryClient.invalidateQueries({ queryKey: ['home', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['home', 'storyboards'] });
      onRestored();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to restore item';
      setRestoreError(message);
    },
  });

  return (
    <div style={styles.row} role="listitem" data-testid={`trash-row-${item.id}`}>
      <span style={styles.kindBadge} aria-label={`Kind: ${item.kind}`}>
        {item.kind}
      </span>
      <p style={styles.itemName} title={item.name}>
        {item.name}
      </p>
      <p style={styles.deletedAt}>
        {formatDeletedAt(item.deletedAt)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button
          type="button"
          style={styles.restoreButton}
          onClick={() => { setRestoreError(null); doRestore(); }}
          disabled={isPending}
          aria-label={`Restore ${item.name}`}
        >
          {isPending ? 'Restoring…' : 'Restore'}
        </button>
        {restoreError != null && (
          <p role="alert" style={styles.restoreSuccessText}>
            {restoreError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrashPanel
// ---------------------------------------------------------------------------

/**
 * Full-page panel listing the user's last 50 soft-deleted items with
 * per-row Restore buttons.
 *
 * Route: /trash (protected — see main.tsx).
 * Accessible via the Home sidebar in a future iteration; for now it is
 * navigable directly.
 */
export function TrashPanel(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<TrashItem[]>({
    queryKey: ['trash'],
    queryFn: listTrash,
  });

  function handleBack(): void {
    navigate(-1);
  }

  const items = data ?? [];

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <button
          type="button"
          style={styles.backButton}
          onClick={handleBack}
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 style={styles.pageTitle}>Trash</h1>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {isLoading && (
          <p style={styles.loadingText}>Loading…</p>
        )}

        {isError && (
          <p role="alert" style={styles.errorText}>
            Could not load trash. Please try again.
          </p>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Trash is empty</p>
            <p style={styles.emptySubtitle}>
              Deleted items will appear here for a limited time before being permanently removed.
            </p>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div style={styles.list} role="list" aria-label="Deleted items">
            {items.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                onRestored={() => { /* query invalidation handled inside TrashRow */ }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
