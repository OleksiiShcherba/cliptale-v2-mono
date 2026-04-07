import React from 'react';

const BORDER = '#252535';
const HANDLE_ACTIVE = '#1E1E2E'; // surface-elevated token — approved active drag state

/** Props for the TimelineResizeHandle component. */
export interface TimelineResizeHandleProps {
  /** Called when a pointer is pressed on the handle. */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Called when the pointer moves while captured on the handle. */
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Called when the pointer is released. */
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * A 4-pixel horizontal drag handle placed between the editor row and the
 * timeline panel. Dragging it up/down resizes the timeline height.
 *
 * Uses `pointer capture` to ensure smooth dragging even when the pointer
 * briefly leaves the narrow strip.
 */
export function TimelineResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: TimelineResizeHandleProps): React.ReactElement {
  const [isActive, setIsActive] = React.useState(false);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to resize timeline"
      style={{
        height: 4,
        background: isActive ? HANDLE_ACTIVE : BORDER,
        cursor: 'ns-resize',
        flexShrink: 0,
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        setIsActive(true);
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        setIsActive(false);
        onPointerUp(e);
      }}
    />
  );
}
