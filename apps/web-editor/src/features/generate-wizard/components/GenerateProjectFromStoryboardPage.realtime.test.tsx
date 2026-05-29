import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboardMusic,
  mockGeneratePendingStoryboardMusic,
  mockRealtimeSubscriptions,
  renderPage,
  setupStoryboardProjectPageTestLifecycle,
} from './GenerateProjectFromStoryboardPage.test-utils';

function emitStoryboardStatus(payload: Record<string, unknown>): void {
  act(() => {
    mockRealtimeSubscriptions.forEach(({ handlers }) => {
      handlers.onEvent({
        type: 'storyboard.status.updated',
        draftId: 'draft-123',
        userId: 'user-1',
        payload,
      });
    });
  });
}

describe('GenerateProjectFromStoryboardPage realtime assembly', () => {
  setupStoryboardProjectPageTestLifecycle();

  it('subscribes before the initial Step 3 status refresh can resolve', async () => {
    let resolveInitial: (value: unknown) => void = () => {};
    mockGeneratePendingStoryboardMusic.mockReturnValueOnce(new Promise((resolve) => {
      resolveInitial = resolve;
    }));
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await waitFor(() => expect(mockRealtimeSubscriptions).toHaveLength(1));
    expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123');
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    emitStoryboardStatus({
      resource: 'storyboardMusic',
      status: { items: [{ id: 'music-1', generationStatus: 'ready', outputFileId: 'music-file-1' }] },
    });

    await waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));

    await act(async () => {
      resolveInitial({ items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }] });
      await Promise.resolve();
    });

    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when an event-triggered Step 3 refresh rejects', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }],
    });
    mockFetchStoryboardMusic.mockRejectedValueOnce(new Error('GET /storyboards/draft-123/music failed: 500'));

    renderPage();

    await waitFor(() => expect(mockRealtimeSubscriptions).toHaveLength(1));
    emitStoryboardStatus({
      resource: 'aiGenerationJob',
      storyboardBindings: [{ resource: 'storyboardMusic' }],
    });

    await waitFor(() => expect(screen.getByText(/background music could not be prepared/i)).toBeTruthy());
    expect(mockRealtimeSubscriptions.at(-1)?.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
  });
});
