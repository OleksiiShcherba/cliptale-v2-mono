/**
 * AddTrackMenu — toolbar button that opens a small dropdown listing the four
 * track types (Video, Audio, Caption, Overlay) and creates an empty track on
 * selection.
 *
 * Rendered inline in the TimelinePanel toolbar. Closes on click-outside or
 * Escape. Keyboard navigable with ArrowUp / ArrowDown / Enter.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useAddEmptyTrack, TRACK_TYPE_LABELS } from '../hooks/useAddEmptyTrack';
import type { TrackType } from '../hooks/useAddEmptyTrack';

// Design tokens
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

/** Ordered list of track types shown in the dropdown. */
const TRACK_TYPES: TrackType[] = ['video', 'audio', 'caption', 'overlay'];

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
  triggerButton: {
    height: 24,
    paddingLeft: 8,
    paddingRight: 8,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    zIndex: 200,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '4px 0',
    minWidth: 128,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    outline: 'none',
  },
  menuItem: {
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    userSelect: 'none',
    outline: 'none',
  },
  menuItemHover: {
    background: BORDER,
  },
};

/**
 * Toolbar button that opens a dropdown to pick a track type and appends an
 * empty track of that type to the current project.
 */
export function AddTrackMenu(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const addTrack = useAddEmptyTrack();

  const handleOpen = useCallback(() => {
    setOpen((prev) => !prev);
    setFocusedIdx(0);
  }, []);

  const handleSelect = useCallback(
    (type: TrackType) => {
      addTrack(type);
      setOpen(false);
    },
    [addTrack],
  );

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Focus first item when menu opens.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[0]?.focus();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusedIdx + 1) % TRACK_TYPES.length;
        setFocusedIdx(next);
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        items?.[next]?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (focusedIdx - 1 + TRACK_TYPES.length) % TRACK_TYPES.length;
        setFocusedIdx(prev);
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        items?.[prev]?.focus();
        return;
      }
    },
    [focusedIdx],
  );

  return (
    <div style={styles.wrapper}>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add track"
        style={styles.triggerButton}
        title="Add empty track"
      >
        + Track
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Select track type"
          style={styles.menu}
          onKeyDown={handleKeyDown}
        >
          {TRACK_TYPES.map((type, idx) => (
            <div
              key={type}
              role="menuitem"
              tabIndex={0}
              style={{
                ...styles.menuItem,
                ...(idx === focusedIdx ? styles.menuItemHover : {}),
              }}
              onFocus={() => setFocusedIdx(idx)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = BORDER;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
              onClick={() => handleSelect(type)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(type);
                }
              }}
            >
              {TRACK_TYPE_LABELS[type]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

