import { useEffect, useState } from 'react';
import { complaintError, type ComplaintError } from '../api/complaints.api';
export default function useComplaintRequest<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: ComplaintError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, attempt, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, attempt, error: complaintError(error) });
      });
    return () => controller.abort();
  }, [key, load, attempt]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
