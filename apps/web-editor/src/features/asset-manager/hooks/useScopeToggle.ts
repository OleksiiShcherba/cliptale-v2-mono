/**
 * Manages the "project scope vs all" toggle state for the asset browser.
 *
 * Defaults to `'project'` scope. On first load, if the scoped fetch returns
 * zero assets, automatically switches to `'all'` and flips the toggle.
 * The auto-switch fires only once (guarded by a ref) to prevent refetch loops.
 */

import { useState, useEffect, useRef } from 'react';

type UseScopeToggleOptions = {
  /** Whether the fetch has completed without error. */
  isSettled: boolean;
  /** Whether the current scoped asset list is empty. */
  isEmpty: boolean;
};

type UseScopeToggleResult = {
  scope: 'project' | 'all';
  setScope: (s: 'project' | 'all') => void;
  toggleScope: () => void;
};

/**
 * Returns scope state and a toggle handler.
 * Automatically switches to `'all'` on first load when `isEmpty` is true.
 */
export function useScopeToggle({ isSettled, isEmpty }: UseScopeToggleOptions): UseScopeToggleResult {
  const [scope, setScope] = useState<'project' | 'all'>('project');
  const autoSwitchedRef = useRef(false);

  useEffect(() => {
    if (isSettled && scope === 'project' && isEmpty && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      setScope('all');
    }
  }, [isSettled, scope, isEmpty]);

  const toggleScope = () => setScope((prev) => (prev === 'project' ? 'all' : 'project'));

  return { scope, setScope, toggleScope };
}
