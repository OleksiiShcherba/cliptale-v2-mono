import React from 'react';
import { useNavigate } from 'react-router-dom';

import { createDraft } from '@/features/generate-wizard/api';
import { UndoToast } from '@/shared/undo/UndoToast';
import { useUndoToast } from '@/shared/undo/useUndoToast';

import { useStoryboardCards } from '../hooks/useStoryboardCards';
import { StoryboardCard } from './StoryboardCard';
import { StoryboardSkeletonCard, StoryboardErrorState } from './StoryboardPanelParts';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';

// ── Skeleton count per spec ──────────────────────────────────────────────────
const SKELETON_COUNT = 3;

/**
 * Returns a CSS grid-template-columns value based on the current viewport width.
 * Responsive: ≥1440 = 3 cols, 768–1439 = 2 cols, <768 = 1 col.
 */
function getGridColumns(): string {
  if (typeof window === 'undefined') return 'repeat(3, 1fr)';
  const w = window.innerWidth;
  if (w >= 1440) return 'repeat(3, 1fr)';
  if (w >= 768) return 'repeat(2, 1fr)';
  return '1fr';
}

// ── Create Storyboard button ─────────────────────────────────────────────────

interface CreateButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

function CreateButton({ onClick, disabled = false }: CreateButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        padding: '8px 16px',
        background: PRIMARY,
        color: TEXT_PRIMARY,
        border: 'none',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        lineHeight: '16px',
        transition: 'background 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = PRIMARY_DARK;
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = PRIMARY;
      }}
    >
      {disabled ? 'Creating…' : 'Create Storyboard'}
    </button>
  );
}

// ── Panel header ─────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  onCreate: () => void;
  isCreating: boolean;
}

function PanelHeader({ onCreate, isCreating }: PanelHeaderProps): React.ReactElement {
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
        Storyboards
      </h1>
      <CreateButton onClick={onCreate} disabled={isCreating} />
    </div>
  );
}

// ── StoryboardPanel ──────────────────────────────────────────────────────────

/**
 * Storyboard panel — main content area for the Storyboard tab.
 *
 * Renders:
 * - Loading: 3 skeleton placeholders
 * - Error: shared error-state component
 * - Empty: "No storyboards yet" copy + centered Create Storyboard CTA
 * - Populated: responsive 3/2/1-col grid of StoryboardCard items
 *
 * Create Storyboard POSTs to create a blank draft then navigates to /generate?draftId=<id>.
 * Card click / Resume navigates to /generate?draftId=<id>.
 */
export function StoryboardPanel(): React.ReactElement {
  const { data, isLoading, isError } = useStoryboardCards();
  const navigate = useNavigate();
  const { toastState, showToast, dismissToast, handleUndo } = useUndoToast();

  // Use window resize to recompute grid columns reactively
  const [gridColumns, setGridColumns] = React.useState<string>(getGridColumns);
  React.useEffect(() => {
    function onResize(): void {
      setGridColumns(getGridColumns());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Guard against double-clicks while the draft POST is in-flight.
  const [isCreating, setIsCreating] = React.useState(false);

  async function handleCreate(): Promise<void> {
    if (isCreating) return;
    setIsCreating(true);
    try {
      // Create a blank draft so the wizard can hydrate from ?draftId= (feedback #2).
      // The wizard's useGenerationDraft hook already handles ?draftId= hydration;
      // no wizard changes are needed.
      const draft = await createDraft({ schemaVersion: 1, blocks: [] });
      navigate(`/generate?draftId=${draft.id}`);
    } catch {
      // Navigation is a best-effort UX action — fall back to wizard without a draft
      // if the server is unreachable so the user is never blocked.
      navigate('/generate');
    } finally {
      setIsCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
        <PanelHeader onCreate={handleCreate} isCreating={isCreating} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 24,
            marginTop: 24,
          }}
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <StoryboardSkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <StoryboardErrorState />;
  }

  const cards = data ?? [];

  if (cards.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 16,
          padding: 32,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <p style={{ fontSize: 20, fontWeight: 600, color: TEXT_PRIMARY, margin: 0 }}>
          No storyboards yet
        </p>
        <p style={{ fontSize: 14, fontWeight: 400, color: TEXT_SECONDARY, margin: 0 }}>
          Start a new generation to create your first storyboard.
        </p>
        <CreateButton onClick={handleCreate} disabled={isCreating} />
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
        <PanelHeader onCreate={handleCreate} isCreating={isCreating} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 24,
            marginTop: 24,
          }}
        >
          {cards.map((card) => (
            <StoryboardCard
              key={card.draftId}
              card={card}
              onShowUndoToast={(label, onUndo) => showToast({ label, onUndo })}
            />
          ))}
        </div>
      </div>
      <UndoToast toastState={toastState} onDismiss={dismissToast} onUndo={handleUndo} />
    </>
  );
}
