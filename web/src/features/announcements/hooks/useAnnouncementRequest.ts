import { useEffect, useState } from 'react';
import {
  announcementAccessError,
  announcementError,
} from '../api/announcements.api';
import type { AnnouncementError } from '../api/announcements.api';

export default function useAnnouncementRequest<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  onAccessError: (error: AnnouncementError) => void,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: AnnouncementError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, attempt, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = announcementError(reason);
        setResult({ key, attempt, error });
        if (announcementAccessError(error)) onAccessError(error);
      });
    return () => controller.abort();
  }, [key, load, attempt, onAccessError]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    pending: !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
