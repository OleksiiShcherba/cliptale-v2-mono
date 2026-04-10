import { vi } from 'vitest';

import type { TopBarProps } from './TopBar';

/**
 * Default TopBar props for tests.
 * Includes all required props with sensible defaults (disabled buttons, no open modals).
 */
export const defaultProps: TopBarProps = {
  projectId: 'test-project-001',
  isSettingsOpen: false,
  onToggleSettings: vi.fn(),
  isHistoryOpen: false,
  onToggleHistory: vi.fn(),
  isExportOpen: false,
  onToggleExport: vi.fn(),
  isRendersOpen: false,
  onToggleRenders: vi.fn(),
  activeRenderCount: 0,
  canExport: true,
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onLogout: vi.fn(),
};
