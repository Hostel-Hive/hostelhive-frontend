import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceError } from '../api/student-attendance.api';
import type { AttendanceError } from '../api/student-attendance.api';
export default function useAttendanceRequest<T>(
  load: (signal: AbortSignal, offset: number) => Promise<T>,
  denied: (error: AttendanceError) => void,
) {
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    data?: T;
    error?: AttendanceError;
    pending: boolean;
  }>({ pending: false });
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );
  const run = useCallback(
    async (offset = 0) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setResult({ pending: true });
      try {
        const data = await load(abort.signal, offset);
        if (!abort.signal.aborted && controller.current === abort)
          setResult({ pending: false, data });
      } catch (reason) {
        if (abort.signal.aborted || controller.current !== abort) return;
        const error = attendanceError(reason);
        if (error.kind === 'session' || error.kind === 'forbidden')
          denied(error);
        else setResult({ pending: false, error });
      }
    },
    [load, denied],
  );
  return { ...result, run };
}
