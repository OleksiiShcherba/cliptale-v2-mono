import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GenerateWizardPage } from './GenerateWizardPage';

describe('GenerateWizardPage', () => {
  it('renders the WizardStepper with currentStep=1', () => {
    render(<GenerateWizardPage />);
    // Stepper is present — check navigation landmark and step 1 active node
    expect(screen.getByRole('navigation', { name: 'Wizard steps' })).toBeTruthy();
    const nodes = screen.getAllByText(/^[123]$/);
    const activeNode = nodes[0].closest('[aria-current="step"]');
    expect(activeNode).toBeTruthy();
  });

  it('renders the left column slot', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByTestId('wizard-left-column')).toBeTruthy();
  });

  it('renders the right column slot', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByTestId('wizard-right-column')).toBeTruthy();
  });

  it('renders the footer slot', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByTestId('wizard-footer')).toBeTruthy();
  });

  it('renders the main body with accessible label', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByRole('main', { name: 'Generate wizard body' })).toBeTruthy();
  });

  it('renders the left column with accessible label', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByRole('region', { name: 'Script and media editor' })).toBeTruthy();
  });

  it('renders the right column with accessible label', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByRole('region', { name: 'Video road map' })).toBeTruthy();
  });

  it('renders the footer with accessible label', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByRole('contentinfo', { name: 'Wizard footer actions' })).toBeTruthy();
  });

  it('renders all three stepper step labels', () => {
    render(<GenerateWizardPage />);
    expect(screen.getByText('Script & Media')).toBeTruthy();
    expect(screen.getByText('Video Road Map')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
  });
});
