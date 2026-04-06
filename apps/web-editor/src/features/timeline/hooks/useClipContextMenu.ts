import { useCallback, useState } from 'react';

import { getSnapshot as getProjectSnapshot } from '@/store/project-store';

import { execClipContextMenuAction, isPlayheadInsideClip } from '../components/clipContextMenuActions';

/** Position and target of an open context menu. */
type ContextMenuState = {
  clipId: string;
  x: number;
  y: number;
};

/**
 * Manages the clip context menu lifecycle: open on right-click, close on
 * dismiss, execute split/delete/duplicate actions.
 */
export function useClipContextMenu(projectId: string): {
  contextMenu: ContextMenuState | null;
  canSplit: boolean;
  handleClipContextMenu: (e: React.MouseEvent, clipId: string) => void;
  handleContextMenuAction: (action: 'split' | 'delete' | 'duplicate') => void;
  handleContextMenuClose: () => void;
} {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleClipContextMenu = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      setContextMenu({ clipId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleContextMenuAction = useCallback(
    (action: 'split' | 'delete' | 'duplicate') => {
      if (!contextMenu) return;
      execClipContextMenuAction(action, contextMenu.clipId, projectId);
      setContextMenu(null);
    },
    [contextMenu, projectId],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  const canSplit = contextMenu
    ? (() => {
        const clip = (getProjectSnapshot().clips ?? []).find((c) => c.id === contextMenu.clipId);
        return clip ? isPlayheadInsideClip(clip) : false;
      })()
    : false;

  return { contextMenu, canSplit, handleClipContextMenu, handleContextMenuAction, handleContextMenuClose };
}
