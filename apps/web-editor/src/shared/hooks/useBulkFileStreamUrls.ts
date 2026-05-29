import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/lib/api-client';

type BulkFileStreamUrlsState = {
  urls: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  missingFileIds: string[];
};

type BulkStreamUrlsResponse = {
  urls: Record<string, string>;
  missingFileIds: string[];
};

type CachedUrl = {
  url: string;
  expiresAt: number;
};

const STREAM_URL_CACHE_TTL_MS = 14 * 60 * 1000;

const urlCache = new Map<string, CachedUrl>();
const missingCache = new Set<string>();
const inFlightRequests = new Map<string, Promise<BulkStreamUrlsResponse>>();

function uniqueSortedIds(fileIds: readonly string[]): string[] {
  return [...new Set(fileIds)].sort();
}

function cachedUrlsFor(fileIds: readonly string[]): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const fileId of fileIds) {
    const cached = urlCache.get(fileId);
    if (!cached) continue;
    if (cached.expiresAt <= Date.now()) {
      urlCache.delete(fileId);
      continue;
    }
    urls[fileId] = cached.url;
  }
  return urls;
}

function soonestCachedExpiryFor(fileIds: readonly string[]): number | null {
  let soonestExpiry: number | null = null;
  for (const fileId of fileIds) {
    const cached = urlCache.get(fileId);
    if (!cached) continue;
    if (cached.expiresAt <= Date.now()) {
      urlCache.delete(fileId);
      continue;
    }
    if (soonestExpiry === null || cached.expiresAt < soonestExpiry) {
      soonestExpiry = cached.expiresAt;
    }
  }
  return soonestExpiry;
}

function hasCachedUrl(fileId: string): boolean {
  return cachedUrlsFor([fileId])[fileId] !== undefined;
}

async function fetchBulkStreamUrls(fileIds: string[]): Promise<BulkStreamUrlsResponse> {
  const requestKey = fileIds.join('|');
  const existing = inFlightRequests.get(requestKey);
  if (existing) return existing;

  const request = apiClient
    .post('/files/stream-urls', { fileIds })
    .then(async (res) => {
      if (!res.ok) throw new Error(`POST /files/stream-urls failed: ${res.status}`);
      return res.json() as Promise<BulkStreamUrlsResponse>;
    })
    .finally(() => {
      inFlightRequests.delete(requestKey);
    });

  inFlightRequests.set(requestKey, request);
  return request;
}

export function useBulkFileStreamUrls(fileIds: readonly string[]): BulkFileStreamUrlsState {
  const stableFileIds = useMemo(() => uniqueSortedIds(fileIds), [fileIds]);
  const stableKey = stableFileIds.join('|');
  const [cacheRefreshTick, setCacheRefreshTick] = useState(0);

  const [state, setState] = useState<BulkFileStreamUrlsState>(() => ({
    urls: cachedUrlsFor(stableFileIds),
    isLoading: stableFileIds.some((fileId) => !hasCachedUrl(fileId) && !missingCache.has(fileId)),
    error: null,
    missingFileIds: stableFileIds.filter((fileId) => missingCache.has(fileId)),
  }));

  useEffect(() => {
    const ids = stableKey === '' ? [] : stableKey.split('|');
    const missingIds = ids.filter((fileId) => !hasCachedUrl(fileId) && !missingCache.has(fileId));

    if (ids.length === 0) {
      setState({ urls: {}, isLoading: false, error: null, missingFileIds: [] });
      return;
    }

    setState({
      urls: cachedUrlsFor(ids),
      isLoading: missingIds.length > 0,
      error: null,
      missingFileIds: ids.filter((fileId) => missingCache.has(fileId)),
    });

    if (missingIds.length === 0) return;

    let cancelled = false;

    fetchBulkStreamUrls(missingIds)
      .then((body) => {
        const expiresAt = Date.now() + STREAM_URL_CACHE_TTL_MS;
        for (const [fileId, url] of Object.entries(body.urls)) {
          urlCache.set(fileId, { url, expiresAt });
          missingCache.delete(fileId);
        }
        for (const fileId of body.missingFileIds) {
          missingCache.add(fileId);
        }
        if (!cancelled) {
          setState({
            urls: cachedUrlsFor(ids),
            isLoading: false,
            error: null,
            missingFileIds: ids.filter((fileId) => missingCache.has(fileId)),
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            urls: cachedUrlsFor(ids),
            isLoading: false,
            error: err instanceof Error ? err.message : 'Preview URLs failed.',
            missingFileIds: ids.filter((fileId) => missingCache.has(fileId)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stableKey, cacheRefreshTick]);

  useEffect(() => {
    const ids = stableKey === '' ? [] : stableKey.split('|');
    if (ids.length === 0) return;

    const expiresAt = soonestCachedExpiryFor(ids);
    if (expiresAt === null) return;

    const timeoutId = window.setTimeout(() => {
      const urls = cachedUrlsFor(ids);
      const missingIds = ids.filter((fileId) => !hasCachedUrl(fileId) && !missingCache.has(fileId));

      setState({
        urls,
        isLoading: missingIds.length > 0,
        error: null,
        missingFileIds: ids.filter((fileId) => missingCache.has(fileId)),
      });

      if (missingIds.length > 0) {
        setCacheRefreshTick((tick) => tick + 1);
      }
    }, Math.max(0, expiresAt - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [stableKey, state.urls]);

  return state;
}

export function clearBulkFileStreamUrlCacheForTests(): void {
  urlCache.clear();
  missingCache.clear();
  inFlightRequests.clear();
}
