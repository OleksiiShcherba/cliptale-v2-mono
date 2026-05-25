import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/api-client';

type FileStreamUrlState = {
  url: string | null;
  isLoading: boolean;
  error: string | null;
};

export function useFileStreamUrl(fileId: string | null): FileStreamUrlState {
  const [state, setState] = useState<FileStreamUrlState>({
    url: null,
    isLoading: Boolean(fileId),
    error: null,
  });

  useEffect(() => {
    if (!fileId) {
      setState({ url: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ url: null, isLoading: true, error: null });

    apiClient.get(`/files/${fileId}/stream`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /files/${fileId}/stream failed: ${res.status}`);
        return res.json() as Promise<{ url: string }>;
      })
      .then((body) => {
        if (!cancelled) setState({ url: body.url, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            url: null,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Preview URL failed.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return state;
}
