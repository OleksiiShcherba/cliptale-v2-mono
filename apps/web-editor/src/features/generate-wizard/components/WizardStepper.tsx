import React from 'react';

import type { WizardStep, WizardStepMeta } from '../types';

// Design-guide tokens (matching LeftSidebarTabs.tsx convention)
const PRIMARY = '#7C3AED';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

const STEPS: WizardStepMeta[] = [
  { step: 1, label: 'Script & Media' },
  { step: 2, label: 'Video Road Map' },
  { step: 3, label: 'Review' },
];

/** Props for WizardStepper. */
export interface WizardStepperProps {
  /** The currently active step (1-based). */
  currentStep: WizardStep;
}

/**
 * Horizontal three-node stepper for the video generation wizard.
 *
 * Renders step nodes (numbered circles) connected by divider lines.
 * The active node uses PRIMARY color; completed nodes are filled;
 * future nodes use BORDER/inactive styling.
 */
export function WizardStepper({ currentStep }: WizardStepperProps): React.ReactElement {
  return (
    <nav aria-label="Wizard steps" style={styles.container}>
      {STEPS.map(({ step, label }, index) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <React.Fragment key={step}>
            <div style={styles.stepWrapper}>
              <div
                style={
                  isActive
                    ? styles.nodeActive
                    : isCompleted
                      ? styles.nodeCompleted
                      : styles.nodeInactive
                }
                aria-current={isActive ? 'step' : undefined}
              >
                <span style={isActive || isCompleted ? styles.nodeNumberActive : styles.nodeNumberInactive}>
                  {step}
                </span>
              </div>
              <span
                style={isActive ? styles.labelActive : styles.labelInactive}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                style={isCompleted ? styles.connectorCompleted : styles.connectorInactive}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const NODE_SIZE = 28;

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '16px 24px',
    background: SURFACE_ELEVATED,
    borderBottom: `1px solid ${BORDER}`,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  stepWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
    minWidth: '80px',
  } as React.CSSProperties,

  nodeActive: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: '50%',
    background: PRIMARY,
    border: `2px solid ${PRIMARY}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  nodeCompleted: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: '50%',
    background: PRIMARY,
    border: `2px solid ${PRIMARY}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    opacity: 0.7,
  } as React.CSSProperties,

  nodeInactive: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: '50%',
    background: 'transparent',
    border: `2px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  nodeNumberActive: {
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1,
  } as React.CSSProperties,

  nodeNumberInactive: {
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 1,
  } as React.CSSProperties,

  labelActive: {
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  labelInactive: {
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 400,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  connectorCompleted: {
    flex: 1,
    height: '2px',
    background: PRIMARY,
    minWidth: '24px',
    maxWidth: '80px',
    alignSelf: 'flex-start',
    marginTop: `${NODE_SIZE / 2}px`,
    opacity: 0.7,
  } as React.CSSProperties,

  connectorInactive: {
    flex: 1,
    height: '2px',
    background: BORDER,
    minWidth: '24px',
    maxWidth: '80px',
    alignSelf: 'flex-start',
    marginTop: `${NODE_SIZE / 2}px`,
  } as React.CSSProperties,
} as const;
