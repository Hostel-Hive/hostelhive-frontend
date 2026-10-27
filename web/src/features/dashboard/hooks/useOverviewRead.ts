import { useEffect, useState } from 'react';
import { overviewError } from '../api/admin-overview.api';
import type { OverviewError } from '../api/admin-overview.api';
export interface OverviewRead<T> {
  data?: T;
  error?: OverviewError;
  fetchedAt?: string;
  loading: boolean;
  retry: () => void;
}
export default function useOverviewRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  denied: (error: OverviewError) => void,
): OverviewRead<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: OverviewError;
    fetchedAt?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            attempt,
            data,
            fetchedAt: new Date().toISOString(),
          });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = overviewError(reason);
        if (error.kind === 'session' || error.kind === 'forbidden')
          denied(error);
        else setResult({ key, attempt, error });
      });
    return () => controller.abort();
  }, [key, attempt, load, denied]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    ...current,
    loading: !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
