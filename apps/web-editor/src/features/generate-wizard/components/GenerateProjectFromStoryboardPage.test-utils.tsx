import React from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboard,
  mockFetchStoryboardMusic,
  mockFetchStoryboardVideos,
  mockGeneratePendingStoryboardMusic,
  mockUseBulkFileStreamUrls,
  mockRealtimeSubscriptions,
} = vi.hoisted(() => ({
  mockCreateProjectFromStoryboard: vi.fn(),
  mockFetchStoryboard: vi.fn(),
  mockFetchStoryboardMusic: vi.fn(),
  mockFetchStoryboardVideos: vi.fn(),
  mockGeneratePendingStoryboardMusic: vi.fn(),
  mockUseBulkFileStreamUrls: vi.fn(),
  mockRealtimeSubscriptions: [] as Array<{
    message: { type: 'subscribe'; scope: 'draft-storyboard'; draftId: string };
    handlers: {
      onEvent: (event: {
        type: 'storyboard.status.updated';
        draftId: string;
        userId: string;
        payload: Record<string, unknown>;
      }) => void;
      onReconnect?: () => void;
    };
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@/features/storyboard/api', () => ({
  createProjectFromStoryboard: mockCreateProjectFromStoryboard,
  fetchStoryboard: mockFetchStoryboard,
  fetchStoryboardMusic: mockFetchStoryboardMusic,
  fetchStoryboardVideos: mockFetchStoryboardVideos,
  generatePendingStoryboardMusic: mockGeneratePendingStoryboardMusic,
}));

vi.mock('@/shared/hooks/useBulkFileStreamUrls', () => ({
  useBulkFileStreamUrls: mockUseBulkFileStreamUrls,
}));

vi.mock('@/lib/realtime-client', () => ({
  getRealtimeClient: () => ({
    subscribe: (
      message: { type: 'subscribe'; scope: 'draft-storyboard'; draftId: string },
      handlers: {
        onEvent: (event: {
          type: 'storyboard.status.updated';
          draftId: string;
          userId: string;
          payload: Record<string, unknown>;
        }) => void;
        onReconnect?: () => void;
      },
    ) => {
      const unsubscribe = vi.fn();
      mockRealtimeSubscriptions.push({ message, handlers, unsubscribe });
      return unsubscribe;
    },
  }),
}));

import {
  GenerateProjectFromStoryboardPage,
  resetStoryboardProjectAssemblyRequestsForTests,
} from './GenerateProjectFromStoryboardPage';

export {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboard,
  mockFetchStoryboardMusic,
  mockFetchStoryboardVideos,
  mockGeneratePendingStoryboardMusic,
  mockUseBulkFileStreamUrls,
  mockRealtimeSubscriptions,
};

export function renderPage(initialEntry: string = '/generate/road-map?draftId=draft-123') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/generate/road-map" element={<GenerateProjectFromStoryboardPage />} />
        <Route path="/editor" element={<div data-testid="editor-page" />} />
        <Route path="/generate" element={<div data-testid="generate-page" />} />
        <Route path="/storyboard/:draftId" element={<div data-testid="storyboard-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

export function renderStrictModePage(initialEntry: string = '/generate/road-map?draftId=draft-123') {
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/generate/road-map" element={<GenerateProjectFromStoryboardPage />} />
          <Route path="/editor" element={<div data-testid="editor-page" />} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>,
  );
}

export function setupStoryboardProjectPageTestLifecycle() {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRealtimeSubscriptions.length = 0;
    resetStoryboardProjectAssemblyRequestsForTests();
    mockFetchStoryboard.mockResolvedValue({ blocks: [], edges: [], musicBlocks: [] });
    mockGeneratePendingStoryboardMusic.mockResolvedValue({ items: [] });
    mockFetchStoryboardMusic.mockResolvedValue({ items: [] });
    mockUseBulkFileStreamUrls.mockImplementation((fileIds: readonly string[]) => ({
      urls: Object.fromEntries(fileIds.map((fileId) => [fileId, `https://signed.test/${fileId}`])),
      isLoading: false,
      error: null,
      missingFileIds: [],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStoryboardProjectAssemblyRequestsForTests();
  });
}
