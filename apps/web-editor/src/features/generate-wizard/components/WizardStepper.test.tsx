import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WizardStepper } from './WizardStepper';

describe('WizardStepper', () => {
  it('renders all three step labels', () => {
    render(<WizardStepper currentStep={1} />);
    expect(screen.getByText('Script & Media')).toBeTruthy();
    expect(screen.getByText('Video Road Map')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('renders a nav with accessible label "Wizard steps"', () => {
    render(<WizardStepper currentStep={1} />);
    expect(screen.getByRole('navigation', { name: 'Wizard steps' })).toBeTruthy();
  });

  it('marks the active step node with aria-current="step" when currentStep=1', () => {
    render(<WizardStepper currentStep={1} />);
    const nodes = screen.getAllByText(/^[123]$/);
    // The first node (step 1) should have aria-current="step"
    const activeNode = nodes[0].closest('[aria-current="step"]');
    expect(activeNode).toBeTruthy();
  });

  it('marks the active step node with aria-current="step" when currentStep=2', () => {
    render(<WizardStepper currentStep={2} />);
    const nodes = screen.getAllByText(/^[123]$/);
    // Only the second node should have aria-current="step"
    const step1Node = nodes[0].closest('[aria-current="step"]');
    const step2Node = nodes[1].closest('[aria-current="step"]');
    expect(step1Node).toBeNull();
    expect(step2Node).toBeTruthy();
  });

  it('marks the active step node with aria-current="step" when currentStep=3', () => {
    render(<WizardStepper currentStep={3} />);
    const nodes = screen.getAllByText(/^[123]$/);
    const step3Node = nodes[2].closest('[aria-current="step"]');
    expect(step3Node).toBeTruthy();
  });

  it('applies a non-transparent background color to the active step node when currentStep=1', () => {
    render(<WizardStepper currentStep={1} />);
    const nodes = screen.getAllByText(/^[123]$/);
    const activeNode = nodes[0].parentElement;
    // jsdom normalises hex colours to rgb() — check it is not transparent (inactive style)
    expect(activeNode?.style.background).not.toBe('transparent');
    expect(activeNode?.style.background).not.toBe('');
  });

  it('applies transparent background to inactive future step nodes', () => {
    render(<WizardStepper currentStep={1} />);
    const nodes = screen.getAllByText(/^[123]$/);
    // Step 2 and 3 are inactive (future) nodes
    const step2Node = nodes[1].parentElement;
    const step3Node = nodes[2].parentElement;
    expect(step2Node?.style.background).toBe('transparent');
    expect(step3Node?.style.background).toBe('transparent');
  });

  it('renders step numbers 1, 2, 3 inside the nodes', () => {
    render(<WizardStepper currentStep={1} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders exactly two connectors between three step nodes', () => {
    const { container } = render(<WizardStepper currentStep={1} />);
    const connectors = container.querySelectorAll('[aria-hidden="true"]');
    expect(connectors).toHaveLength(2);
  });
});
