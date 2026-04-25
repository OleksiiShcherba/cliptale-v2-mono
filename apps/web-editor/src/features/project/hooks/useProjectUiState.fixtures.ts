/**
 * Shared fixtures and constants for useProjectUiState split tests.
 *
 * Note: vi.hoisted() mocks must be declared inline in each test file (Vitest
 * hoisting runs before module resolution and cannot cross file boundaries).
 * Import only constants and non-hoisted helpers from here.
 */

export const PROJECT_A = 'project-aaa';
export const PROJECT_B = 'project-bbb';

export const savedState = {
  playheadFrame: 42,
  zoom: 2,
  pxPerFrame: 8,
  scrollOffsetX: 100,
};

export const DEFAULT_SNAPSHOT = {
  playheadFrame: 0,
  zoom: 1,
  pxPerFrame: 4,
  scrollOffsetX: 0,
  selectedClipIds: [],
  volume: 1,
  isMuted: false,
};
