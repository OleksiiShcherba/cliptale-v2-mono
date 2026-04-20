import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';

import type { ProjectSummary } from '../types';
import { deleteProject, restoreProject } from '../api';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
// TODO: ERROR is duplicated in several card files — consolidate into a shared token file when other tokens are centralised
const ERROR = '#EF4444';

/** Placeholder SVG rendered when thumbnailUrl is null. */
function ThumbnailPlaceholder(): React.ReactElement {
  return (
    <svg
      aria-label="No thumbnail"
      role="img"
      width="100%"
      height="100%"
      viewBox="0 0 160 90"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <rect width="160" height="90" fill="#252535" />
      <rect x="64" y="33" width="32" height="24" rx="4" fill="#8A8AA0" opacity="0.4" />
      <polygon points="72,37 80,45 72,53" fill="#8A8AA0" opacity="0.7" />
    </svg>
  );
}

interface ProjectCardProps {
  project: ProjectSummary;
  /**
   * Optional callback invoked after a successful soft-delete of the project,
   * allowing a parent to show the undo toast.
   */
  onShowUndoToast?: (label: string, onUndo: () => Promise<void>) => void;
}

/**
 * Card component for a single project in the Projects panel.
 *
 * Renders thumbnail (or placeholder SVG), title, and relative last-updated date.
 * Clicking anywhere on the card navigates to /editor?projectId=<id>.
 */
export function ProjectCard({ project, onShowUndoToast }: ProjectCardProps): React.ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  function handleClick(): void {
    navigate(`/editor?projectId=${project.projectId}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/editor?projectId=${project.projectId}`);
    }
  }

  async function handleDelete(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const projectId = project.projectId;
      await deleteProject(projectId);
      // Optimistically hide the card; invalidate query so list refetches
      setIsVisible(false);
      void queryClient.invalidateQueries({ queryKey: ['home', 'projects'] });
      onShowUndoToast?.(
        `"${project.title}" deleted`,
        async () => {
          await restoreProject(projectId);
          setIsVisible(true);
          void queryClient.invalidateQueries({ queryKey: ['home', 'projects'] });
        },
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const relativeDate = formatRelativeDate(new Date(project.updatedAt));

  if (!isVisible) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open project: ${project.title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        background: SURFACE_ELEVATED,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Thumbnail region — 16:9 aspect ratio */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          background: '#252535',
        }}
      >
        {project.thumbnailUrl != null ? (
          <img
            src={project.thumbnailUrl}
            alt={project.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <ThumbnailPlaceholder />
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p
          style={{
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
          {project.title}
        </p>
        <p
          title={project.updatedAt}
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 400,
            color: TEXT_SECONDARY,
            lineHeight: '16px',
          }}
        >
          {relativeDate}
        </p>
      </div>

      {/* Footer: Delete button */}
      <div
        style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`Delete project ${project.title}`}
          onClick={(e) => { void handleDelete(e); }}
          disabled={isDeleting}
          style={{
            padding: '4px 12px',
            background: 'transparent',
            color: ERROR,
            border: `1px solid ${ERROR}`,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 400,
            fontFamily: 'Inter, sans-serif',
            lineHeight: '16px',
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
