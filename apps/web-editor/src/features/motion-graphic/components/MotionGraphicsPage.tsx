/**
 * MotionGraphicsPage — the AI Motion Graphic gallery (US-01 / T13).
 *
 * Lists the Creator's graphics most-recent first (title + duration + status),
 * shows an empty state when there are none (AC-13), and offers rename (AC-01)
 * and duplicate (AC-12) actions wired to the api.ts CRUD surface.
 *
 * Conventions mirrored from the generate-ai-flow slice (FlowListPage):
 *   - Data layer: TanStack Query via useMotionGraphicsList (api.ts, never raw fetch).
 *   - Card chrome + §3 Dark Theme tokens shared with ProjectsPanel / FlowCard.
 *   - Navigation: useNavigate → the authoring view (/motion-graphics/:id, T16/T17).
 *
 * Rendered behind a protected `/motion-graphics` route (registered in main.tsx, T4).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HomeSidebar } from '@/features/home/components/HomeSidebar';

import { useMotionGraphicsList } from '../hooks/useMotionGraphicsList';
import { MotionGraphicCard } from './MotionGraphicCard';
import { motionGraphicsPageStyles as styles } from './motionGraphicsPage.styles';

export function MotionGraphicsPage(): React.ReactElement {
  const navigate = useNavigate();
  const { graphics, isLoading, isError, rename, duplicate } = useMotionGraphicsList();

  function handleOpen(id: string): void {
    navigate(`/motion-graphics/${id}`);
  }

  function handleNew(): void {
    navigate('/motion-graphics/new');
  }

  return (
    // Two-column layout — the same left nav as the rest of the app (Projects /
    // Storyboard / Generate AI), with AI Motion Graphics shown active.
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0D0D14' }}>
      <HomeSidebar activeNav="motion-graphics" />
      <main style={{ ...styles.page, flex: 1 }} data-testid="motion-graphics-page">
      <div style={styles.header}>
        <h1 style={styles.heading}>Motion Graphics</h1>
        <button
          type="button"
          onClick={handleNew}
          style={styles.newButton}
          data-testid="motion-graphics-new"
        >
          + New motion graphic
        </button>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading motion graphics" style={styles.loading}>
          Loading…
        </div>
      ) : isError ? (
        <div role="alert" style={styles.error}>
          Could not load motion graphics. Please refresh and try again.
        </div>
      ) : graphics.length === 0 ? (
        <div style={styles.empty} data-testid="motion-graphics-empty">
          <p style={styles.emptyTitle}>No motion graphics yet</p>
          <p style={styles.emptyHint}>
            Create your first motion graphic to get started.
          </p>
          <button
            type="button"
            onClick={handleNew}
            style={styles.newButton}
            data-testid="motion-graphics-empty-new"
          >
            + New motion graphic
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {graphics.map((graphic) => (
            <MotionGraphicCard
              key={graphic.id}
              graphic={graphic}
              onOpen={handleOpen}
              onRename={rename}
              onDuplicate={duplicate}
            />
          ))}
        </div>
      )}
      </main>
    </div>
  );
}
