import { useEffect } from 'react';

/**
 * Registers global keyboard shortcuts for undo (Ctrl+Z) and redo (Ctrl+Y or
 * Ctrl+Shift+Z). Calls the provided handlers when the matching key combinations
 * are pressed. Cleans up the event listener on unmount.
 */
export function useKeyboardShortcuts({
  onUndo,
  onRedo,
}: {
  onUndo: () => void;
  onRedo: () => void;
}): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        onRedo();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onUndo, onRedo]);
}
