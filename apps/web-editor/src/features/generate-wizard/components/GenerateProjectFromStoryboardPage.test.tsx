import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboardMusic,
  mockFetchStoryboardVideos,
  mockGeneratePendingStoryboardMusic,
  mockRealtimeSubscriptions,
  renderPage,
  renderStrictModePage,
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

describe('GenerateProjectFromStoryboardPage', () => {
  setupStoryboardProjectPageTestLifecycle();

  it('shows loading and navigates to the editor after successful assembly', async () => {
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    expect(screen.getByText(/background music and creating your editor project/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123');
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images');
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
  });

  it('dedupes the request under React Strict Mode double effects', async () => {
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderStrictModePage();

    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
  });

  it('waits for ready videos before assembling a video project', async () => {
    mockFetchStoryboardVideos.mockResolvedValue({
      items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    renderPage('/generate/road-map?draftId=draft-123&mode=videos');

    expect(screen.getByText(/storyboard videos and background music/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockFetchStoryboardVideos).toHaveBeenCalledWith('draft-123');
    expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123');
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'videos');
  });

  it('waits for realtime video readiness before assembly', async () => {
    mockFetchStoryboardVideos
      .mockResolvedValueOnce({ items: [{ blockId: 'scene-1', status: 'running', outputFileId: null }] });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    renderPage('/generate/road-map?draftId=draft-123&mode=videos');

    await vi.waitFor(() => expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(1));
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    emitStoryboardStatus({
      resource: 'storyboardVideos',
      status: { items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }] },
    });

    await vi.waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'videos'));
    expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(1);
  });

  it('waits for realtime music readiness before image assembly', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await vi.waitFor(() => expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123'));
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    emitStoryboardStatus({
      resource: 'storyboardMusic',
      status: { items: [{ id: 'music-1', generationStatus: 'ready', outputFileId: 'music-file-1' }] },
    });

    await vi.waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));
    expect(mockFetchStoryboardMusic).not.toHaveBeenCalled();
  });

  it('refreshes Step 3 music status after reconnect before image assembly', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }],
    });
    mockFetchStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'ready', outputFileId: 'music-file-1' }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    await vi.waitFor(() => expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123'));
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    await act(async () => {
      mockRealtimeSubscriptions.at(-1)?.handlers.onReconnect?.();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));
    expect(mockFetchStoryboardMusic).toHaveBeenCalledTimes(1);
  });

  it('dedupes video assembly under React Strict Mode double effects', async () => {
    mockFetchStoryboardVideos.mockResolvedValue({
      items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    renderStrictModePage('/generate/road-map?draftId=draft-123&mode=videos');

    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(1);
    expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'videos');
  });

  it('shows retry when video generation fails before assembly', async () => {
    mockFetchStoryboardVideos.mockResolvedValue({
      items: [{ blockId: 'scene-1', status: 'failed', outputFileId: null, errorMessage: 'Video failed' }],
    });

    renderPage('/generate/road-map?draftId=draft-123&mode=videos');

    await waitFor(() => expect(screen.getByText(/video failed/i)).toBeTruthy());
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('shows retry when music generation fails before assembly', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{
        id: 'music-1',
        generationStatus: 'failed',
        outputFileId: null,
        errorMessage: 'ElevenLabs API 500 provider timeout',
      }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/background music could not be prepared/i)).toBeTruthy());
    expect(screen.queryByText(/elevenlabs|provider|api 500/i)).toBeNull();
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to storyboard/i }).getAttribute('href')).toBe(
      '/storyboard/draft-123',
    );
  });

  it('fails fast when Step 3 finds a generate-now music block that has not started', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{
        id: 'music-1',
        sourceMode: 'generate_now',
        generationStatus: 'failed',
        generationJobId: null,
        outputFileId: null,
        errorMessage: 'Generate this music block in Step 2 before starting Step 3.',
      }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/music block set to generate now is not ready/i)).toBeTruthy());
    expect(mockFetchStoryboardMusic).not.toHaveBeenCalled();
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
  });

  it('sanitizes provider-shaped music request errors before rendering them', async () => {
    mockGeneratePendingStoryboardMusic.mockRejectedValueOnce(
      new Error('POST /storyboards/draft-123/music/generate-pending failed: ElevenLabs API provider quota'),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(/background music could not be prepared/i)).toBeTruthy());
    expect(screen.queryByText(/elevenlabs|provider|quota|generate-pending/i)).toBeNull();
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
  });

  it('sanitizes endpoint-shaped music refresh errors before rendering them', async () => {
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }],
    });
    mockFetchStoryboardMusic.mockRejectedValueOnce(new Error('GET /storyboards/draft-123/music failed: 500'));

    renderPage();

    await vi.waitFor(() => expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123'));

    emitStoryboardStatus({
      resource: 'aiGenerationJob',
      storyboardBindings: [{ resource: 'storyboardMusic' }],
    });

    await vi.waitFor(() => expect(screen.getByText(/background music could not be prepared/i)).toBeTruthy());
    expect(screen.queryByText(/GET|storyboards|draft-123|failed: 500/i)).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to storyboard/i })).toBeTruthy();
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
  });

  it('does not call the API when draftId is missing and links back to generate', () => {
    renderPage('/generate/road-map');

    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();
    expect(screen.getByText(/missing storyboard draft/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /back to generate/i });
    expect(link.getAttribute('href')).toBe('/generate');
  });

  it('shows retry and back-to-storyboard actions after assembly failure', async () => {
    mockCreateProjectFromStoryboard.mockRejectedValueOnce(new Error('Assembly failed'));

    renderPage();

    await waitFor(() => expect(screen.getByText(/assembly failed/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    const link = screen.getByRole('link', { name: /back to storyboard/i });
    expect(link.getAttribute('href')).toBe('/storyboard/draft-123');
  });

  it('retries assembly after a failed request', async () => {
    mockCreateProjectFromStoryboard
      .mockRejectedValueOnce(new Error('Assembly failed'))
      .mockResolvedValueOnce({ projectId: 'project-456', versionId: 8 });

    renderPage();

    await waitFor(() => expect(screen.getByText(/assembly failed/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(2);
  });
});
