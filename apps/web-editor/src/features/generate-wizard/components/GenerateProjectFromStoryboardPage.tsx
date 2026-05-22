import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { createProjectFromStoryboard } from '@/features/storyboard/api';

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

export function resetStoryboardProjectAssemblyRequestsForTests(): void {
  inFlightByDraft.clear();
}

function startAssembly(draftId: string): Promise<string> {
  const existing = inFlightByDraft.get(draftId);
  if (existing) {
    return existing;
  }

  const promise = createProjectFromStoryboard(draftId)
    .then((result) => result.projectId)
    .catch((err: unknown) => {
      inFlightByDraft.delete(draftId);
      throw err;
    });
  inFlightByDraft.set(draftId, promise);
  return promise;
}

export function GenerateProjectFromStoryboardPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const draftId = searchParams.get('draftId');
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

    startAssembly(draftId)
      .then((projectId) => {
        if (!cancelled) {
          navigate(`/editor?projectId=${encodeURIComponent(projectId)}`, { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(err instanceof Error ? err.message : 'Project assembly failed.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, draftId, navigate]);

  const handleRetry = useCallback(() => {
    if (draftId) {
      inFlightByDraft.delete(draftId);
    }
    setAttempt((value) => value + 1);
  }, [draftId]);

  return (
    <main style={styles.page}>
      <section style={styles.panel} aria-live="polite">
        <div style={styles.statusDot} data-state={status} />
        <h1 style={styles.heading}>Step 3</h1>
        {status === 'loading' ? (
          <p style={styles.message}>Creating your editor project...</p>
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
