import { useEffect, useState } from 'react';
import { attendanceError } from '../api/student-attendance.api';
import type { AttendanceError } from '../api/student-attendance.api';
export default function useStaffAttendanceRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  denied: (e: AttendanceError) => void,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: AttendanceError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, attempt, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = attendanceError(reason);
        if (error.kind === 'session' || error.kind === 'forbidden')
          denied(error);
        else setResult({ key, attempt, error });
      });
    return () => controller.abort();
  }, [key, load, attempt, denied]);
  const current =
    result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    pending: !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
