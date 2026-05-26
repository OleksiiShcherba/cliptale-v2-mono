import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  mockCreateProjectFromStoryboard,
  mockFetchStoryboardMusic,
  mockFetchStoryboardVideos,
  mockGeneratePendingStoryboardMusic,
} = vi.hoisted(() => ({
  mockCreateProjectFromStoryboard: vi.fn(),
  mockFetchStoryboardMusic: vi.fn(),
  mockFetchStoryboardVideos: vi.fn(),
  mockGeneratePendingStoryboardMusic: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  createProjectFromStoryboard: mockCreateProjectFromStoryboard,
  fetchStoryboardMusic: mockFetchStoryboardMusic,
  fetchStoryboardVideos: mockFetchStoryboardVideos,
  generatePendingStoryboardMusic: mockGeneratePendingStoryboardMusic,
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
    mockGeneratePendingStoryboardMusic.mockResolvedValue({ items: [] });
    mockFetchStoryboardMusic.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStoryboardProjectAssemblyRequestsForTests();
  });

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

    expect(screen.getByText(/storyboard videos and background music/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('editor-page')).toBeTruthy());
    expect(mockFetchStoryboardVideos).toHaveBeenCalledWith('draft-123');
    expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123');
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

  it('polls generated music until it is ready before image assembly', async () => {
    vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(2000);
    });

    await vi.waitFor(() => expect(mockCreateProjectFromStoryboard).toHaveBeenCalledWith('draft-123', 'images'));
    expect(mockFetchStoryboardMusic).toHaveBeenCalledWith('draft-123');
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

  it('sanitizes endpoint-shaped music polling errors before rendering them', async () => {
    vi.useFakeTimers();
    mockGeneratePendingStoryboardMusic.mockResolvedValueOnce({
      items: [{ id: 'music-1', generationStatus: 'running', outputFileId: null }],
    });
    mockFetchStoryboardMusic.mockRejectedValueOnce(new Error('GET /storyboards/draft-123/music failed: 500'));

    renderPage();

    await vi.waitFor(() => expect(mockGeneratePendingStoryboardMusic).toHaveBeenCalledWith('draft-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
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
