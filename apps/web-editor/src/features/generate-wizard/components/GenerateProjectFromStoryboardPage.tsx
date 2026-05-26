import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  createProjectFromStoryboard,
  fetchStoryboardMusic,
  fetchStoryboardVideos,
  generatePendingStoryboardMusic,
} from '@/features/storyboard/api';
import type {
  StoryboardMusicResponse,
  StoryboardProjectAssemblyMode,
  StoryboardVideoStatusResponse,
} from '@/features/storyboard/types';

const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const ERROR = '#EF4444';

type AssemblyStatus = 'loading' | 'error';

const inFlightByDraft = new Map<string, Promise<string>>();
const READY_POLL_INTERVAL_MS = 2000;
const GENERATE_NOW_NOT_READY_ERROR =
  'A music block set to Generate now is not ready. Go back to Step 2, generate it, then retry Step 3.';
const MUSIC_PREPARATION_ERROR =
  'Background music could not be prepared. Go back to Step 2, review the music block, then retry Step 3.';
const STORYBOARD_MUSIC_ENDPOINT_ERROR_PATTERN = /\b(?:GET|POST|PUT|PATCH)\s+\/storyboards\/[^/\s]+\/music\b/i;

export function resetStoryboardProjectAssemblyRequestsForTests(): void {
  inFlightByDraft.clear();
}

function getInFlightKey(draftId: string, mode: StoryboardProjectAssemblyMode): string {
  return `${draftId}:${mode}`;
}

function videosAreReady(status: StoryboardVideoStatusResponse): boolean {
  return status.items.length > 0 && status.items.every((item) => item.status === 'ready' && item.outputFileId);
}

function getVideoFailure(status: StoryboardVideoStatusResponse): string | null {
  const failed = status.items.find((item) => item.status === 'failed');
  return failed?.errorMessage ?? (failed ? 'Storyboard video generation failed.' : null);
}

function musicIsReady(status: StoryboardMusicResponse): boolean {
  return status.items.every((item) => item.generationStatus === 'ready' && item.outputFileId);
}

function getMusicFailure(status: StoryboardMusicResponse): string | null {
  const failed = status.items.find((item) => item.generationStatus === 'failed');
  if (!failed) return null;
  if (/generate this music block|generate now|not ready/i.test(failed.errorMessage ?? '')) {
    return GENERATE_NOW_NOT_READY_ERROR;
  }
  return MUSIC_PREPARATION_ERROR;
}

function toAssemblyErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Project assembly failed.';
  }
  if (/generate this music block|generate now|music block.*not ready/i.test(err.message)) {
    return GENERATE_NOW_NOT_READY_ERROR;
  }
  if (
    STORYBOARD_MUSIC_ENDPOINT_ERROR_PATTERN.test(err.message) ||
    /elevenlabs|provider|\/music\/|background music|music block|music generation/i.test(err.message)
  ) {
    return MUSIC_PREPARATION_ERROR;
  }
  return err.message;
}

async function waitForStoryboardVideos(draftId: string): Promise<void> {
  while (true) {
    const status = await fetchStoryboardVideos(draftId);
    const failure = getVideoFailure(status);
    if (failure) {
      throw new Error(failure);
    }
    if (videosAreReady(status)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
}

async function waitForStoryboardMusic(draftId: string): Promise<void> {
  let status = await generatePendingStoryboardMusic(draftId);
  while (true) {
    const failure = getMusicFailure(status);
    if (failure) {
      throw new Error(failure);
    }
    if (musicIsReady(status)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
    status = await fetchStoryboardMusic(draftId);
  }
}

function startAssembly(draftId: string, mode: StoryboardProjectAssemblyMode): Promise<string> {
  const key = getInFlightKey(draftId, mode);
  const existing = inFlightByDraft.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (mode === 'videos') {
      await Promise.all([
        waitForStoryboardVideos(draftId),
        waitForStoryboardMusic(draftId),
      ]);
    } else {
      await waitForStoryboardMusic(draftId);
    }
    return createProjectFromStoryboard(draftId, mode);
  })()
    .then((result) => result.projectId)
    .catch((err: unknown) => {
      inFlightByDraft.delete(key);
      throw err;
    });
  inFlightByDraft.set(key, promise);
  return promise;
}

export function GenerateProjectFromStoryboardPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const draftId = searchParams.get('draftId');
  const mode: StoryboardProjectAssemblyMode = searchParams.get('mode') === 'videos' ? 'videos' : 'images';
  const [status, setStatus] = useState<AssemblyStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const storyboardHref = useMemo(
    () => (draftId ? `/storyboard/${encodeURIComponent(draftId)}` : '/generate'),
    [draftId],
  );

  useEffect(() => {
    if (!draftId) {
      setStatus('error');
      setErrorMessage('Missing storyboard draft.');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    startAssembly(draftId, mode)
      .then((projectId) => {
        if (!cancelled) {
          navigate(`/editor?projectId=${encodeURIComponent(projectId)}`, { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(toAssemblyErrorMessage(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, draftId, mode, navigate]);

  const handleRetry = useCallback(() => {
    if (draftId) {
      inFlightByDraft.delete(getInFlightKey(draftId, mode));
    }
    setAttempt((value) => value + 1);
  }, [draftId, mode]);

  return (
    <main style={styles.page}>
      <section style={styles.panel} aria-live="polite">
        <div style={styles.statusDot} data-state={status} />
        <h1 style={styles.heading}>Step 3</h1>
        {status === 'loading' ? (
          <p style={styles.message}>
            {mode === 'videos'
              ? 'Generating storyboard videos and background music...'
              : 'Generating background music and creating your editor project...'}
          </p>
        ) : (
          <>
            <p style={styles.error}>{errorMessage ?? 'Project assembly failed.'}</p>
            <div style={styles.actions}>
              {draftId ? (
                <button type="button" style={styles.primaryButton} onClick={handleRetry}>
                  Retry
                </button>
              ) : null}
              <Link to={storyboardHref} style={styles.secondaryLink}>
                {draftId ? 'Back to storyboard' : 'Back to generate'}
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,
  panel: {
    width: 'min(440px, 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 24,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    textAlign: 'center',
  } as React.CSSProperties,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    background: PRIMARY,
  } as React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: 20,
    lineHeight: '28px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,
  message: {
    margin: 0,
    fontSize: 14,
    lineHeight: '20px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,
  error: {
    margin: 0,
    fontSize: 14,
    lineHeight: '20px',
    color: ERROR,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 4,
  } as React.CSSProperties,
  primaryButton: {
    height: 36,
    padding: '0 14px',
    border: 0,
    borderRadius: 8,
    background: PRIMARY,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  secondaryLink: {
    minHeight: 36,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 14px',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE_ELEVATED,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
  } as React.CSSProperties,
} as const;
