import type React from 'react';

import type { AiCapability, AiGroup } from '@/shared/ai-generation/types';

import {
  BORDER,
  PRIMARY,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './aiGenerationPanelTokens';
import { aiGenerationPanelStyles as s } from './aiGenerationPanelStyles';

/** Props for the two-level CapabilityTabs component. */
export interface CapabilityTabsProps {
  activeGroup: AiGroup;
  activeCapability: AiCapability | null;
  onGroupChange: (group: AiGroup) => void;
  onCapabilityChange: (capability: AiCapability) => void;
}

type GroupConfig = { id: AiGroup; label: string };
type CapConfig = { id: AiCapability; label: string; group: AiGroup };

const GROUPS: readonly GroupConfig[] = [
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
];

const CAPABILITIES: readonly CapConfig[] = [
  { id: 'text_to_image', label: 'Text → Image', group: 'images' },
  { id: 'image_edit', label: 'Edit / Blend', group: 'images' },
  { id: 'text_to_video', label: 'Text → Video', group: 'videos' },
  { id: 'image_to_video', label: 'Image → Video', group: 'videos' },
  { id: 'text_to_speech', label: 'Text to Speech', group: 'audio' },
  { id: 'voice_cloning', label: 'Voice Cloning', group: 'audio' },
  { id: 'speech_to_speech', label: 'Speech to Speech', group: 'audio' },
  { id: 'music_generation', label: 'Music', group: 'audio' },
];

const groupRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${BORDER}`,
};

const groupButtonBase: React.CSSProperties = {
  flex: 1,
  height: '32px',
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  color: TEXT_SECONDARY,
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
  textAlign: 'center',
};

const groupButtonActiveStyle: React.CSSProperties = {
  ...groupButtonBase,
  background: SURFACE_ELEVATED,
  border: `1px solid ${PRIMARY}`,
  color: TEXT_PRIMARY,
  fontWeight: 600,
};

/**
 * Two-level navigation for the AI Generation panel.
 *
 * Top level: Images / Videos / Audio group buttons.
 * Second level: sub-category capability tabs for the active group.
 *
 * Fully controlled: owns no state, reports changes via callbacks.
 */
export function CapabilityTabs({
  activeGroup,
  activeCapability,
  onGroupChange,
  onCapabilityChange,
}: CapabilityTabsProps) {
  const capsForGroup = CAPABILITIES.filter((c) => c.group === activeGroup);

  return (
    <div>
      {/* Top-level group selector */}
      <div role="tablist" aria-label="AI generation group" style={groupRowStyle}>
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === activeGroup}
            style={g.id === activeGroup ? groupButtonActiveStyle : groupButtonBase}
            onClick={() => onGroupChange(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Sub-category tabs for the active group */}
      <div role="tablist" aria-label="AI generation capability" style={s.tabRow}>
        {capsForGroup.map((cap) => {
          const isActive = cap.id === activeCapability;
          return (
            <button
              key={cap.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              style={isActive ? s.tabButtonActive : s.tabButton}
              onClick={() => onCapabilityChange(cap.id)}
            >
              {cap.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
