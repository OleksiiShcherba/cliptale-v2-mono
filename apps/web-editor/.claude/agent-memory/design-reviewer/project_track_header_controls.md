---
name: TrackHeader control button pattern
description: Established style pattern for M (mute) and L (lock) control buttons in TrackHeader — used as baseline for any new control buttons added to the track header
type: project
---

Established in `trackHeaderStyles.ts` via `controlButton`:
- Size: 20×20px
- Background: transparent
- Border: `1px solid #252535` (BORDER token)
- Border radius: 4px (radius-sm token)
- Color: `#8A8AA0` (TEXT_SECONDARY token)
- Font size: 9px
- Font weight: 600
- Font family: Inter

Active states use full background fill:
- Mute active: `controlButtonActive` — WARNING (#F59E0B) background, black text
- Lock active: `controlButtonLocked` — PRIMARY (#7C3AED) background, white text
- Delete hover (per design guide error token): should use ERROR (#EF4444) color/border

**Why:** Any new control buttons added to the track header should match this pattern for visual consistency, unless deliberately styled differently with documented justification.
**How to apply:** When a new control button is added to TrackHeader, flag deviations from this 20×20px/9px/BORDER-border baseline.
