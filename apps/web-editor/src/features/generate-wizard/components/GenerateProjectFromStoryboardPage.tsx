import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { fetchStoryboard } from '@/features/storyboard/api';
import type {
  StoryboardState,
  StoryboardProjectAssemblyMode,
} from '@/features/storyboard/types';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';

import {
  GENERATE_NOW_NOT_READY_ERROR,
  MUSIC_PREPARATION_ERROR,
  STORYBOARD_MUSIC_ENDPOINT_ERROR_PATTERN,
  clearStoryboardProjectAssemblyRequest,
  resetStoryboardProjectAssemblyRequestsForTests,
  startAssembly,
} from './GenerateProjectFromStoryboardPage.assembly';
import { generateProjectFromStoryboardPageStyles as styles } from './GenerateProjectFromStoryboardPage.styles';

type AssemblyStatus = 'loading' | 'error';

export { resetStoryboardProjectAssemblyRequestsForTests };

function collectStoryboardImageFileIds(state: StoryboardState): string[] {
  const ids = new Set<string>();
  state.blocks.forEach((block) => {
    block.mediaItems.forEach((item) => {
      if (item.mediaType === 'image') ids.add(item.fileId);
    });
  });
  return [...ids];
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

export function GenerateProjectFromStoryboardPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const draftId = searchParams.get('draftId');
  const mode: StoryboardProjectAssemblyMode = searchParams.get('mode') === 'videos' ? 'videos' : 'images';
  const [status, setStatus] = useState<AssemblyStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [storyboardImageFileIds, setStoryboardImageFileIds] = useState<string[] | null>(null);
  const {
    urls: storyboardImageUrls,
    error: storyboardImageUrlError,
    missingFileIds: missingStoryboardImageFileIds,
  } = useBulkFileStreamUrls(storyboardImageFileIds ?? []);
  const missingStoryboardImageFileIdSet = useMemo(
    () => new Set(missingStoryboardImageFileIds),
    [missingStoryboardImageFileIds],
  );
  const unresolvedStoryboardImageFileIds = useMemo(
    () => (storyboardImageFileIds ?? []).filter(
      (fileId) => !storyboardImageUrls[fileId] && !missingStoryboardImageFileIdSet.has(fileId),
    ),
    [missingStoryboardImageFileIdSet, storyboardImageFileIds, storyboardImageUrls],
  );
  const areStoryboardImageUrlsReady = storyboardImageFileIds !== null &&
    (
      storyboardImageUrlError !== null ||
      unresolvedStoryboardImageFileIds.length === 0
    );

  const storyboardHref = useMemo(
    () => (draftId ? `/storyboard/${encodeURIComponent(draftId)}` : '/generate'),
    [draftId],
  );

  useEffect(() => {
    if (!draftId) {
      setStoryboardImageFileIds([]);
      return;
    }

    let cancelled = false;
    setStoryboardImageFileIds(null);
    fetchStoryboard(draftId)
      .then((state) => {
        if (!cancelled) setStoryboardImageFileIds(collectStoryboardImageFileIds(state));
      })
      .catch(() => {
        if (!cancelled) setStoryboardImageFileIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, draftId]);

  useEffect(() => {
    if (!draftId) {
      setStatus('error');
      setErrorMessage('Missing storyboard draft.');
      return;
    }
    if (storyboardImageFileIds === null) return;
    if (!areStoryboardImageUrlsReady) return;

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
  }, [areStoryboardImageUrlsReady, attempt, draftId, mode, navigate, storyboardImageFileIds]);

  const handleRetry = useCallback(() => {
    if (draftId) {
      clearStoryboardProjectAssemblyRequest(draftId, mode);
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
