import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { LeftSidebarTabs } from './LeftSidebarTabs';

describe('LeftSidebarTabs', () => {
  it('renders two tab buttons: Assets and AI Generate', () => {
    render(<LeftSidebarTabs activeTab="assets" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Assets' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'AI Generate' })).toBeTruthy();
  });

  it('renders a nav with role=tablist and accessible label', () => {
    render(<LeftSidebarTabs activeTab="assets" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: 'Left sidebar tabs' })).toBeTruthy();
  });

  it('marks the active tab with aria-selected=true', () => {
    render(<LeftSidebarTabs activeTab="ai-generate" onTabChange={vi.fn()} />);
    const aiTab = screen.getByRole('tab', { name: 'AI Generate' });
    expect(aiTab.getAttribute('aria-selected')).toBe('true');
  });

  it('marks inactive tabs with aria-selected=false', () => {
    render(<LeftSidebarTabs activeTab="ai-generate" onTabChange={vi.fn()} />);
    const assetsTab = screen.getByRole('tab', { name: 'Assets' });
    expect(assetsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange with "assets" when Assets tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<LeftSidebarTabs activeTab="ai-generate" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    expect(onTabChange).toHaveBeenCalledWith('assets');
  });

  it('calls onTabChange with "ai-generate" when AI Generate tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<LeftSidebarTabs activeTab="assets" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Generate' }));
    expect(onTabChange).toHaveBeenCalledWith('ai-generate');
  });

  it('calls onTabChange exactly once per click', () => {
    const onTabChange = vi.fn();
    render(<LeftSidebarTabs activeTab="assets" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Generate' }));
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });
});
