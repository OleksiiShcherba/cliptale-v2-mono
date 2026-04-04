/**
 * ClipContextMenu — lightweight right-click context menu for ClipBlock.
 *
 * Rendered as an absolutely-positioned `<div>` overlay within the timeline
 * panel. No external library required.
 *
 * Menu items:
 * - Split at Playhead — disabled (greyed out) when playhead is not overlapping
 * - Delete Clip
 * - Duplicate Clip
 *
 * Keyboard navigation: ArrowUp/ArrowDown to move focus, Enter to activate,
 * Escape to close.
 */

import React, { useCallback, useEffect, useRef } from 'react';

// Design tokens
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const ERROR = '#EF4444';

/** A single item in the context menu. */
interface MenuItem {
  id: string;
  label: string;
  /** When true the item is shown but cannot be activated. */
  disabled?: boolean;
  /** When true the item is styled with the destructive (error) color. */
  destructive?: boolean;
}

interface ClipContextMenuProps {
  /** Screen X position where the menu should appear. */
  x: number;
  /** Screen Y position where the menu should appear. */
  y: number;
  /** Whether "Split at Playhead" should be enabled. */
  canSplit: boolean;
  /** Called when the user selects an action. */
  onAction: (action: 'split' | 'delete' | 'duplicate') => void;
  /** Called when the menu should close (click outside, Escape). */
  onClose: () => void;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'split', label: 'Split at Playhead' },
  { id: 'delete', label: 'Delete Clip', destructive: true },
  { id: 'duplicate', label: 'Duplicate Clip' },
];

/**
 * Lightweight context menu rendered at absolute screen coordinates.
 * Manages its own focus and keyboard navigation.
 */
export function ClipContextMenu({
  x,
  y,
  canSplit,
  onAction,
  onClose,
}: ClipContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const focusedIndexRef = useRef(0);

  // Focus the menu container on mount so keyboard events are captured.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // Focus first enabled item.
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    if (items[0]) {
      items[0].focus();
      focusedIndexRef.current = 0;
    }
  }, []);

  // Close on click outside.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleAction = useCallback(
    (id: string) => {
      if (id === 'split' && !canSplit) return;
      onAction(id as 'split' | 'delete' | 'duplicate');
      onClose();
    },
    [canSplit, onAction, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const menu = menuRef.current;
      if (!menu) return;

      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'),
      );

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusedIndexRef.current + 1) % items.length;
        focusedIndexRef.current = next;
        items[next]?.focus();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (focusedIndexRef.current - 1 + items.length) % items.length;
        focusedIndexRef.current = prev;
        items[prev]?.focus();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const focused = document.activeElement as HTMLElement;
        const actionId = focused?.dataset['action'];
        if (actionId) handleAction(actionId);
        return;
      }
    },
    [handleAction, onClose],
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Clip actions"
      style={{
        ...styles.menu,
        left: x,
        top: y,
      }}
      onKeyDown={handleKeyDown}
    >
      {MENU_ITEMS.map(({ id, label, destructive }) => {
        const isDisabled = id === 'split' && !canSplit;

        return (
          <div
            key={id}
            role="menuitem"
            tabIndex={isDisabled ? -1 : 0}
            aria-disabled={isDisabled ? 'true' : undefined}
            data-action={id}
            style={{
              ...styles.item,
              color: isDisabled
                ? TEXT_SECONDARY
                : destructive
                ? ERROR
                : TEXT_PRIMARY,
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
            }}
            onClick={() => handleAction(id)}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                (e.currentTarget as HTMLElement).style.background = '#252535';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 1000,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '4px 0',
    minWidth: 160,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    outline: 'none',
  },
  item: {
    padding: '6px 12px',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '20px',
    userSelect: 'none',
    outline: 'none',
  },
};
