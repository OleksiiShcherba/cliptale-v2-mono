import React from 'react';

import { useSearchParams } from 'react-router-dom';

import type { HomeTab } from '../types';
import { HomeSidebar } from './HomeSidebar';
import { ProjectsPanel } from './ProjectsPanel';
import { StoryboardPanel } from './StoryboardPanel';
import { FlowListPage } from '@/features/generate-ai-flow/components/FlowListPage';

/** Resolve the active tab from a `?tab=` hint; unknown values fall back to Projects. */
function tabFromParam(value: string | null): HomeTab {
  if (value === 'storyboard') return 'storyboard';
  if (value === 'generate-ai') return 'generate-ai';
  return 'projects';
}

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';

/**
 * Home page — post-login landing surface.
 *
 * Two-column layout: HomeSidebar (left, 240px) + main content region (right).
 * Active tab drives which stub panel renders on the right.
 * Default tab is Projects unless `?tab=storyboard` is present in the URL
 * (set by the generate wizard's "Back to Storyboard" button).
 */
export function HomePage(): React.ReactElement {
  const [searchParams] = useSearchParams();

  // Read the tab hint from the URL on mount.
  // `?tab=storyboard` is set by GenerateWizardPage when the user clicks
  // "Back to Storyboard"; `?tab=generate-ai` is set by the flow editor's Home link.
  // Absence / an unrecognised value keeps the default (Projects).
  const initialTab: HomeTab = tabFromParam(searchParams.get('tab'));

  const [activeTab, setActiveTab] = React.useState<HomeTab>(initialTab);

  return (
    <div
      style={{
        display: 'flex',
        // height: 100vh bounds the flex container so the <main> child can
        // scroll independently via overflow: auto. minHeight: '100vh' prevented
        // the browser from constraining the height, so <main> had no finite
        // height to scroll within (feedback #1 fix).
        height: '100vh',
        background: SURFACE,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <HomeSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        style={{
          flex: 1,
          // minHeight: 0 overrides the default flex min-height so the child
          // cannot grow beyond the parent's bounded height.
          minHeight: 0,
          background: SURFACE_ALT,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        {activeTab === 'projects' ? (
          <ProjectsPanel />
        ) : activeTab === 'storyboard' ? (
          <StoryboardPanel />
        ) : (
          <FlowListPage />
        )}
      </main>
    </div>
  );
}
