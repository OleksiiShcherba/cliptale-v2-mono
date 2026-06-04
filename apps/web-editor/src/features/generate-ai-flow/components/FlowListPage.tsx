/**
 * T16 — FlowListPage
 *
 * Renders the Creator's generation flows (most-recent first) and supports
 * create / rename / delete / open actions.
 *
 * Conventions followed:
 *   - Design tokens: same §3 Dark Theme constants used by ProjectsPanel / ProjectCard.
 *   - Primitives:    inline-styled components (no CSS files) — matches the entire repo.
 *   - Data layer:    react-query useQuery/useMutation + api.ts (never raw fetch).
 *   - Navigation:    useNavigate from react-router-dom.
 */

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { createFlow, deleteFlow, listFlows, renameFlow } from '../api';
import type { FlowSummary } from '../types';

// ── Design tokens (§3 Dark Theme — same as ProjectsPanel / ProjectCard) ────
const SURFACE_BASE = '#13131F';
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const ERROR = '#EF4444';
const SUCCESS = '#22C55E';

// ── Query key ───────────────────────────────────────────────────────────────

const QUERY_KEY = ['generate-ai-flow', 'list'] as const;

// ── Sub-components ──────────────────────────────────────────────────────────

function LoadingState(): React.ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading flows"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 200,
        color: TEXT_SECONDARY,
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

function ErrorState(): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        padding: 32,
        color: ERROR,
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}
    >
      Could not load flows. Please refresh and try again.
    </div>
  );
}

interface CreateButtonProps {
  isLoading: boolean;
  onClick: () => void;
}

function CreateButton({ isLoading, onClick }: CreateButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={onClick}
      aria-busy={isLoading}
      style={{
        padding: '8px 16px',
        background: isLoading ? PRIMARY_DARK : PRIMARY,
        color: TEXT_PRIMARY,
        border: 'none',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        cursor: isLoading ? 'not-allowed' : 'pointer',
        lineHeight: '20px',
        transition: 'background 0.15s',
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {isLoading ? 'Creating…' : 'Create Flow'}
    </button>
  );
}

// ── FlowCard ─────────────────────────────────────────────────────────────────

interface FlowCardProps {
  flow: FlowSummary;
  onOpen: (flowId: string) => void;
  onDelete: (flowId: string) => void;
  onRename: (flowId: string, title: string) => Promise<void>;
}

function FlowCard({ flow, onOpen, onDelete, onRename }: FlowCardProps): React.ReactElement {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(flow.title);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  // U4 — the whole card opens the flow (like ProjectCard / AssetCard);
  // inner controls stopPropagation, and renaming suspends navigation.
  function handleCardOpen(): void {
    if (isRenaming) return;
    onOpen(flow.flowId);
  }

  function handleCardKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.target !== e.currentTarget) return; // keys inside inner controls (rename input, buttons)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardOpen();
    }
  }

  async function handleRenameSubmit(): Promise<void> {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === flow.title) {
      setIsRenaming(false);
      return;
    }
    await onRename(flow.flowId, trimmed);
    setIsRenaming(false);
  }

  async function handleDeleteClick(): Promise<void> {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      onDelete(flow.flowId);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      void handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setRenameValue(flow.title);
      setIsRenaming(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open flow ${flow.title}`}
      onClick={handleCardOpen}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: SURFACE_ELEVATED,
        border: `1px solid ${isHovered ? PRIMARY : BORDER}`,
        borderRadius: 8,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isRenaming ? (
          <input
            aria-label="Flow title"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => { void handleRenameSubmit(); }}
            autoFocus
            style={{
              flex: 1,
              background: SURFACE_BASE,
              color: TEXT_PRIMARY,
              border: `1px solid ${PRIMARY}`,
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 16,
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />
        ) : (
          <h3
            style={{
              flex: 1,
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              lineHeight: '20px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {flow.title}
          </h3>
        )}
      </div>

      {/* Meta row */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: TEXT_SECONDARY,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Updated {new Date(flow.updatedAt).toLocaleString()}
      </p>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          aria-label={`Rename ${flow.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setRenameValue(flow.title);
            setIsRenaming(true);
          }}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: TEXT_SECONDARY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
          }}
        >
          Rename
        </button>

        <button
          type="button"
          aria-label={`Delete ${flow.title}`}
          onClick={(e) => {
            e.stopPropagation();
            void handleDeleteClick();
          }}
          disabled={isDeleting}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: ERROR,
            border: `1px solid ${ERROR}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            cursor: isDeleting ? 'not-allowed' : 'pointer',
            opacity: isDeleting ? 0.6 : 1,
          }}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── FlowListPage (main export) ────────────────────────────────────────────────

/**
 * The Generate AI Flow list page — accessible at /generate-ai.
 *
 * Shows the Creator's flows most-recent first (AC-04).
 * Create → POST /generation-flows → navigate to /generate-ai/:flowId.
 * Open   → navigate to /generate-ai/:flowId.
 * Rename → PATCH /generation-flows/:id.
 * Delete → DELETE /generation-flows/:id (optimistic removal).
 */
export function FlowListPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createError, setCreateError] = React.useState<string | null>(null);
  // Optimistic hidden set for deleted flows (by flowId)
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listFlows(),
  });

  const { mutate: doCreate, isPending: isCreating } = useMutation({
    mutationFn: () => createFlow(),
    onSuccess: (flow) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      navigate(`/generate-ai/${flow.flowId}`);
    },
    onError: () => {
      setCreateError('Failed to create flow. Please try again.');
    },
  });

  const { mutate: doRename } = useMutation({
    mutationFn: ({ flowId, title }: { flowId: string; title: string }) =>
      renameFlow(flowId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (flowId: string) => deleteFlow(flowId),
    onSuccess: (_result, flowId) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function handleCreate(): void {
    setCreateError(null);
    doCreate();
  }

  function handleOpen(flowId: string): void {
    navigate(`/generate-ai/${flowId}`);
  }

  function handleDelete(flowId: string): void {
    // Optimistically remove from the visible list
    setHiddenIds((prev) => new Set([...prev, flowId]));
    doDelete(flowId, {
      onError: () => {
        // Restore on failure
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(flowId);
          return next;
        });
      },
    });
  }

  async function handleRename(flowId: string, title: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      doRename(
        { flowId, title },
        { onSuccess: () => resolve(), onError: (err) => reject(err) },
      );
    });
  }

  // ── Render states ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', background: SURFACE_BASE, minHeight: '100vh' }}>
        <PageHeader isCreating={false} onCreate={handleCreate} />
        <LoadingState />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', background: SURFACE_BASE, minHeight: '100vh' }}>
        <PageHeader isCreating={false} onCreate={handleCreate} />
        <ErrorState />
      </div>
    );
  }

  const flows = (data?.items ?? []).filter((f) => !hiddenIds.has(f.flowId));

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', background: SURFACE_BASE, minHeight: '100vh' }}>
      <PageHeader isCreating={isCreating} onCreate={handleCreate} />

      {createError != null && (
        <p
          role="alert"
          style={{ fontSize: 12, color: ERROR, margin: '8px 0 0' }}
        >
          {createError}
        </p>
      )}

      {flows.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            paddingTop: 80,
          }}
        >
          <p style={{ fontSize: 20, fontWeight: 600, color: TEXT_PRIMARY, margin: 0 }}>
            No flows yet
          </p>
          <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: 0 }}>
            Create your first Generate AI flow to get started.
          </p>
          <CreateButton isLoading={isCreating} onClick={handleCreate} />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
            marginTop: 24,
          }}
        >
          {flows.map((flow) => (
            <FlowCard
              key={flow.flowId}
              flow={flow}
              onOpen={handleOpen}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Internal: PageHeader ─────────────────────────────────────────────────────

interface PageHeaderProps {
  isCreating: boolean;
  onCreate: () => void;
}

function PageHeader({ isCreating, onCreate }: PageHeaderProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 0,
      }}
    >
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: TEXT_PRIMARY,
          margin: 0,
          lineHeight: '32px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Generate AI Flows
      </h1>
      <CreateButton isLoading={isCreating} onClick={onCreate} />
    </div>
  );
}
