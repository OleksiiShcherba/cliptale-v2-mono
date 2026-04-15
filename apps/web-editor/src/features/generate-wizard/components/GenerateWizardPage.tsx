import React from 'react';

import { WizardStepper } from './WizardStepper';

// Design-guide tokens (matching LeftSidebarTabs.tsx convention)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

/** Breakpoint at which the two-column (8fr / 4fr) layout kicks in. */
const LG_BREAKPOINT = 1024;

/**
 * The `/generate` page shell.
 *
 * Pure layout — no business logic, no fetches. Provides:
 * - A header row with the WizardStepper (currentStep=1)
 * - A two-column body (8fr / 4fr) at ≥1024px, single-column below
 * - A footer slot at the bottom
 *
 * Business content (PromptEditor, RoadMap panel, Review, footer actions) will be
 * mounted here by follow-up tickets #5, #6, #7 etc.
 */
export function GenerateWizardPage(): React.ReactElement {
  const [windowWidth, setWindowWidth] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );

  React.useEffect(() => {
    function handleResize(): void {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isLg = windowWidth >= LG_BREAKPOINT;

  return (
    <div style={styles.page}>
      {/* Header — WizardStepper */}
      <header style={styles.header}>
        <WizardStepper currentStep={1} />
      </header>

      {/* Two-column body */}
      <main
        style={
          isLg
            ? styles.bodyDesktop
            : styles.bodyMobile
        }
        aria-label="Generate wizard body"
      >
        {/* Left column — primary content (PromptEditor area, tickets #5/#7/#9) */}
        <section
          style={styles.leftColumn}
          aria-label="Script and media editor"
          data-testid="wizard-left-column"
        >
          <div style={styles.columnPlaceholder}>
            <span style={styles.placeholderText}>
              Script &amp; Media — coming in ticket #5
            </span>
          </div>
        </section>

        {/* Right column — secondary panel (RoadMap / Review, tickets #6/#12) */}
        <section
          style={styles.rightColumn}
          aria-label="Video road map"
          data-testid="wizard-right-column"
        >
          <div style={styles.columnPlaceholder}>
            <span style={styles.placeholderText}>
              Video Road Map — coming in ticket #6
            </span>
          </div>
        </section>
      </main>

      {/* Footer slot */}
      <footer style={styles.footer} aria-label="Wizard footer actions" data-testid="wizard-footer">
        {/* Footer actions (Back / Next / Generate) — tickets #12 */}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    flexShrink: 0,
  } as React.CSSProperties,

  bodyDesktop: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '8fr 4fr',
    overflow: 'hidden',
    gap: 0,
  } as React.CSSProperties,

  bodyMobile: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE,
    borderRight: `1px solid ${BORDER}`,
    padding: '24px',
  } as React.CSSProperties,

  rightColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: SURFACE_ALT,
    padding: '24px',
  } as React.CSSProperties,

  columnPlaceholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: SURFACE_ELEVATED,
    borderRadius: '8px',
    padding: '32px',
    minHeight: '120px',
  } as React.CSSProperties,

  placeholderText: {
    color: TEXT_SECONDARY,
    fontSize: '14px',
    fontWeight: 400,
    textAlign: 'center' as const,
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
    gap: '12px',
  } as React.CSSProperties,
} as const;
