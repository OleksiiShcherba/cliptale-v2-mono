import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockCreateProjectFromStoryboard, mockFetchStoryboardVideos } = vi.hoisted(() => ({
  mockCreateProjectFromStoryboard: vi.fn(),
  mockFetchStoryboardVideos: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  createProjectFromStoryboard: mockCreateProjectFromStoryboard,
  fetchStoryboardVideos: mockFetchStoryboardVideos,
}));

import {
  GenerateProjectFromStoryboardPage,
  resetStoryboardProjectAssemblyRequestsForTests,
} from './GenerateProjectFromStoryboardPage';

function renderPage(initialEntry: string = '/generate/road-map?draftId=draft-123') {
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

describe('GenerateProjectFromStoryboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStoryboardProjectAssemblyRequestsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStoryboardProjectAssemblyRequestsForTests();
  });

  it('shows loading and navigates to the editor after successful assembly', async () => {
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    renderPage();

    expect(screen.getByText(/creating your editor project/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images');
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
  });

  it('dedupes the request under React Strict Mode double effects', async () => {
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-123', versionId: 7 });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/generate/road-map?draftId=draft-123']}>
          <Routes>
            <Route path="/generate/road-map" element={<GenerateProjectFromStoryboardPage />} />
            <Route path="/editor" element={<div data-testid="editor-page" />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledTimes(1);
  });

  it('waits for ready videos before assembling a video project', async () => {
    mockFetchStoryboardVideos.mockResolvedValue({
      items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    renderPage('/generate/road-map?draftId=draft-123&mode=videos');

    expect(screen.getByText(/generating storyboard videos/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockFetchStoryboardVideos).toHaveBeenCalledWith('draft-123');
    expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'videos');
  });

  it('polls queued video status until videos are ready before assembly', async () => {
    vi.useFakeTimers();
    mockFetchStoryboardVideos
      .mockResolvedValueOnce({
        items: [{ blockId: 'scene-1', status: 'running', outputFileId: null }],
      })
      .mockResolvedValueOnce({
        items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }],
      });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    renderPage('/generate/road-map?draftId=draft-123&mode=videos');

    await vi.waitFor(() => expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(1));
    expect(mockCreateProjectFromStoryboard).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await vi.waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'videos'));
    expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(2);
  });

  it('dedupes video assembly under React Strict Mode double effects', async () => {
    mockFetchStoryboardVideos.mockResolvedValue({
      items: [{ blockId: 'scene-1', status: 'ready', outputFileId: 'video-file-1' }],
    });
    mockCreateProjectFromStoryboard.mockResolvedValue({ projectId: 'project-video', versionId: 9 });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/generate/road-map?draftId=draft-123&mode=videos']}>
          <Routes>
            <Route path="/generate/road-map" element={<GenerateProjectFromStoryboardPage />} />
            <Route path="/editor" element={<div data-testid="editor-page" />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockFetchStoryboardVideos).toHaveBeenCalledTimes(1);
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
