/**
 * StoryboardStatusMenu — kebab (⋮) status menu shown on a *completed* storyboard
 * status block. Presentational only: the owner gate, the two actions, and the
 * confirm flow are decided by the caller (the workspace). It renders nothing for
 * a non-owner (AC-09), and the kebab is kept in the tab order so it is reachable
 * by keyboard, then visually revealed on hover / focus.
 */

import React from 'react';

import { storyboardStatusMenuStyles as s } from './StoryboardStatusMenu.styles';

interface StoryboardStatusMenuProps {
  /** Only the draft owner ever sees the menu (AC-09). */
  isOwner: boolean;
  /** Human label for the block this menu acts on (e.g. "Generated scenes applied"). */
  label: string;
  onRegenerate: () => void;
  onHide: () => void;
}

function KebabIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function StoryboardStatusMenu({
  isOwner,
  label,
  onRegenerate,
  onHide,
}: StoryboardStatusMenuProps): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // AC-09: the whole control is absent from a non-owner's DOM.
  if (!isOwner) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
    }
  };

  const triggerStyle = {
    ...s.trigger,
    ...(revealed ? s.triggerRevealed : null),
    ...(open ? s.triggerOpen : null),
  };

  return (
    <div
      style={s.root}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setRevealed(false);
          setOpen(false);
        }
      }}
      onKeyDown={handleKeyDown}
      data-testid="storyboard-status-menu-root"
    >
      <button
        ref={triggerRef}
        type="button"
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status menu — ${label}`}
        onClick={() => setOpen((v) => !v)}
        data-testid="storyboard-status-menu-trigger"
      >
        <KebabIcon />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${label} actions`}
          style={s.menu}
          data-testid="storyboard-status-menu"
        >
          <button
            type="button"
            role="menuitem"
            style={s.item}
            onClick={() => {
              close(false);
              onRegenerate();
            }}
            data-testid="storyboard-status-menu-regenerate"
          >
            Regenerate
          </button>
          <button
            type="button"
            role="menuitem"
            style={s.item}
            onClick={() => {
              close(false);
              onHide();
            }}
            data-testid="storyboard-status-menu-hide"
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}
