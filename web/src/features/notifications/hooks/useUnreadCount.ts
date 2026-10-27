import { useCallback, useEffect, useState } from 'react';
import {
  getUnreadCount,
  notificationError,
  notificationAccessError,
} from '../api/notifications.api';
import type { NotificationError } from '../api/notifications.api';

const changed = 'hostelhive:inbox-changed';
export function refreshUnreadCount(uid: string) {
  window.dispatchEvent(new CustomEvent(changed, { detail: uid }));
}
export default function useUnreadCount(
  uid: string,
  role: string,
  onAccessError?: (e: NotificationError) => void,
) {
  const key = `${uid}:${role}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    count?: number;
    error?: NotificationError;
  }>();
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (uid)
      void getUnreadCount(uid, controller.signal)
        .then((count) => {
          if (!controller.signal.aborted) setResult({ key, attempt, count });
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            const error = notificationError(reason);
            setResult({ key, attempt, error });
            if (notificationAccessError(error)) onAccessError?.(error);
          }
        });
    return () => controller.abort();
  }, [uid, key, attempt, onAccessError]);
  useEffect(() => {
    const onChange = (event: Event) => {
      if ((event as CustomEvent<unknown>).detail === uid) refresh();
    };
    const visibleRefresh = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener(changed, onChange);
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    const timer = window.setInterval(visibleRefresh, 60000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(changed, onChange);
      window.removeEventListener('focus', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [uid, refresh]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return { count: current?.count, error: current?.error, refresh };
}
