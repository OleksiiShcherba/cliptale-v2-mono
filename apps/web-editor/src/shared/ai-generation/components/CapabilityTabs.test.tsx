import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CapabilityTabs } from './CapabilityTabs';

const defaultProps = {
  activeGroup: 'images' as const,
  activeCapability: 'text_to_image' as const,
  onGroupChange: () => undefined,
  onCapabilityChange: () => undefined,
};

describe('CapabilityTabs / group row', () => {
  it('renders all three group buttons', () => {
    render(<CapabilityTabs {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /^images$/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^videos$/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^audio$/i })).toBeTruthy();
  });

  it('marks the active group tab with aria-selected=true', () => {
    render(<CapabilityTabs {...defaultProps} activeGroup="videos" activeCapability="text_to_video" />);
    const videosTab = screen.getByRole('tab', { name: /^videos$/i });
    expect(videosTab.getAttribute('aria-selected')).toBe('true');
    const imagesTab = screen.getByRole('tab', { name: /^images$/i });
    expect(imagesTab.getAttribute('aria-selected')).toBe('false');
  });

  it('fires onGroupChange when a group button is clicked', async () => {
    const user = userEvent.setup();
    const onGroupChange = vi.fn();
    render(<CapabilityTabs {...defaultProps} onGroupChange={onGroupChange} />);
    await user.click(screen.getByRole('tab', { name: /^videos$/i }));
    expect(onGroupChange).toHaveBeenCalledWith('videos');
  });

  it('fires onGroupChange with "audio" when the Audio button is clicked', async () => {
    const user = userEvent.setup();
    const onGroupChange = vi.fn();
    render(<CapabilityTabs {...defaultProps} onGroupChange={onGroupChange} />);
    await user.click(screen.getByRole('tab', { name: /^audio$/i }));
    expect(onGroupChange).toHaveBeenCalledWith('audio');
  });
});

describe('CapabilityTabs / capability sub-tabs', () => {
  it('renders only image capability tabs when group is images', () => {
    render(<CapabilityTabs {...defaultProps} activeGroup="images" activeCapability="text_to_image" />);
    expect(screen.getByRole('tab', { name: /text → image/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /edit \/ blend/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /text → video/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /image → video/i })).toBeNull();
  });

  it('renders only video capability tabs when group is videos', () => {
    render(
      <CapabilityTabs
        {...defaultProps}
        activeGroup="videos"
        activeCapability="text_to_video"
      />,
    );
    expect(screen.getByRole('tab', { name: /text → video/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /image → video/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /text → image/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /edit \/ blend/i })).toBeNull();
  });

  it('marks the active capability tab with aria-selected=true', () => {
    render(
      <CapabilityTabs {...defaultProps} activeGroup="images" activeCapability="image_edit" />,
    );
    const active = screen.getByRole('tab', { name: /edit \/ blend/i });
    expect(active.getAttribute('aria-selected')).toBe('true');
    const inactive = screen.getByRole('tab', { name: /text → image/i });
    expect(inactive.getAttribute('aria-selected')).toBe('false');
  });

  it('fires onCapabilityChange when a capability tab is clicked', async () => {
    const user = userEvent.setup();
    const onCapabilityChange = vi.fn();
    render(<CapabilityTabs {...defaultProps} onCapabilityChange={onCapabilityChange} />);
    await user.click(screen.getByRole('tab', { name: /edit \/ blend/i }));
    expect(onCapabilityChange).toHaveBeenCalledWith('image_edit');
  });
});

describe('CapabilityTabs / audio sub-tabs', () => {
  it('renders all four audio capability tabs when group is audio', () => {
    render(
      <CapabilityTabs
        {...defaultProps}
        activeGroup="audio"
        activeCapability="text_to_speech"
      />,
    );
    expect(screen.getByRole('tab', { name: /text to speech/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /voice cloning/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /speech to speech/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /music/i })).toBeTruthy();
  });

  it('does not render image or video tabs when group is audio', () => {
    render(
      <CapabilityTabs
        {...defaultProps}
        activeGroup="audio"
        activeCapability="text_to_speech"
      />,
    );
    expect(screen.queryByRole('tab', { name: /text → image/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /text → video/i })).toBeNull();
  });

  it('marks the active audio capability tab with aria-selected=true', () => {
    render(
      <CapabilityTabs
        {...defaultProps}
        activeGroup="audio"
        activeCapability="voice_cloning"
      />,
    );
    const active = screen.getByRole('tab', { name: /voice cloning/i });
    expect(active.getAttribute('aria-selected')).toBe('true');
    const inactive = screen.getByRole('tab', { name: /text to speech/i });
    expect(inactive.getAttribute('aria-selected')).toBe('false');
  });

  it('fires onCapabilityChange with audio capability when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onCapabilityChange = vi.fn();
    render(
      <CapabilityTabs
        {...defaultProps}
        activeGroup="audio"
        activeCapability="text_to_speech"
        onCapabilityChange={onCapabilityChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /music/i }));
    expect(onCapabilityChange).toHaveBeenCalledWith('music_generation');
  });
});
