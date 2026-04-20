import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { UndoToast } from '@/shared/undo/UndoToast';
import { useUndoToast } from '@/shared/undo/useUndoToast';

import { createProject } from '../api';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { SkeletonCard, ProjectsErrorState } from './ProjectsPanelParts';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const ERROR = '#EF4444';

// ── Skeleton card count per spec ────────────────────────────────────────────
const SKELETON_COUNT = 6;

/**
 * Responsive grid CSS using inline style.
 * Returns a CSS grid template columns value based on the viewport width.
 */
function getGridColumns(): string {
  if (typeof window === 'undefined') return 'repeat(3, 1fr)';
  const w = window.innerWidth;
  if (w >= 1440) return 'repeat(3, 1fr)';
  if (w >= 768) return 'repeat(2, 1fr)';
  return '1fr';
}

/**
 * Primary CTA button for creating a new project.
 */
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
      {isLoading ? 'Creating…' : 'Create New Project'}
    </button>
  );
}

/**
 * Projects panel — main content area for the Projects tab.
 *
 * Renders:
 * - Loading: 6 skeleton placeholders
 * - Error: shared error-state component
 * - Empty: "No projects yet" copy + centered Create CTA
 * - Populated: responsive 3/2/1-col grid of ProjectCard items
 *
 * Header always shows the Create CTA (except empty state which centers it).
 */
export function ProjectsPanel(): React.ReactElement {
  const { data, isLoading, isError } = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toastState, showToast, dismissToast, handleUndo } = useUndoToast();

  const [createError, setCreateError] = React.useState<string | null>(null);

  // Use window resize to recompute grid columns reactively
  const [gridColumns, setGridColumns] = React.useState<string>(getGridColumns);
  React.useEffect(() => {
    function onResize(): void {
      setGridColumns(getGridColumns());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { mutate: doCreate, isPending: isCreating } = useMutation({
    mutationFn: () => createProject(),
    onSuccess: (projectId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['home', 'projects'] });
      navigate(`/editor?projectId=${projectId}`);
    },
    onError: () => {
      setCreateError('Failed to create project. Please try again.');
    },
  });

  function handleCreate(): void {
    setCreateError(null);
    doCreate();
  }

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
        <PanelHeader isCreating={false} onCreate={handleCreate} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 24,
            marginTop: 24,
          }}
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <ProjectsErrorState />;
  }

  const projects = data ?? [];

  if (projects.length === 0) {
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
          No projects yet
        </p>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: 0 }}>
          Create your first project to get started.
        </p>
        <CreateButton isLoading={isCreating} onClick={handleCreate} />
        {createError != null && (
          <p
            role="alert"
            style={{ fontSize: 12, color: ERROR, margin: 0 }}
          >
            {createError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
      <PanelHeader isCreating={isCreating} onCreate={handleCreate} />
      {createError != null && (
        <p
          role="alert"
          style={{ fontSize: 12, color: ERROR, margin: '8px 0 0' }}
        >
          {createError}
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          gap: 24,
          marginTop: 24,
        }}
      >
        {projects.map((project) => (
          <ProjectCard
            key={project.projectId}
            project={project}
            onShowUndoToast={(label, onUndo) => showToast({ label, onUndo })}
          />
        ))}
      </div>
      <UndoToast toastState={toastState} onDismiss={dismissToast} onUndo={handleUndo} />
    </div>
  );
}

// ── Internal sub-components ──────────────────────────────────────────────────

interface PanelHeaderProps {
  isCreating: boolean;
  onCreate: () => void;
}

function PanelHeader({ isCreating, onCreate }: PanelHeaderProps): React.ReactElement {
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
        Projects
      </h1>
      <CreateButton isLoading={isCreating} onClick={onCreate} />
    </div>
  );
}
