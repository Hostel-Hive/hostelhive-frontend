import { useEffect, useState } from 'react';
import { studentError } from '../api/students.api';
import type { StudentRequestError } from '../api/students.api';

export default function useStudentRequest<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: StudentRequestError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, attempt, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, attempt, error: studentError(error) });
      });
    return () => controller.abort();
  }, [key, attempt, load]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
