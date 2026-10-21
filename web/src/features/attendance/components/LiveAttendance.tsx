import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import { startAttendanceLive } from '../api/attendance-live';
import type { LiveAttendanceState } from '../api/attendance-live';
import type { AttendanceError } from '../api/student-attendance.api';

type Props = {
  uid: string;
  onUpdate: () => void;
  denied: (error: AttendanceError) => void;
};
const messages: Record<LiveAttendanceState['phase'], string> = {
  connecting: 'Connecting to live attendance…',
  waiting: 'Connected. Waiting for the first attendance publication.',
  live: 'Live attendance feed connected.',
  reconnecting:
    'Connection interrupted. Reconnecting while staff access remains valid.',
  stale:
    'The latest attendance publication is over 90 seconds old. Updates may be delayed.',
  disabled: 'Live attendance is disabled on the backend. Use manual refresh.',
  unavailable:
    'Live attendance is unavailable. Use manual refresh or reconnect.',
};
function ActiveFeed({ uid, onUpdate, denied }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LiveAttendanceState>({
    phase: 'connecting',
  });
  useEffect(
    () =>
      startAttendanceLive(uid, {
        state: setState,
        invalidate: onUpdate,
        denied,
      }),
    [uid, onUpdate, denied, attempt],
  );
  return (
    <>
      <p role="status">{state.message ?? messages[state.phase]}</p>
      {state.projection && (
        <p className="staff-attendance-caption">
          Last published:{' '}
          <time
            dateTime={new Date(state.projection.published_at).toISOString()}
          >
            {new Date(state.projection.published_at).toLocaleString()}
          </time>{' '}
          (device time).
        </p>
      )}
      {state.publication?.pending && (
        <p className="staff-attendance-caption">
          The backend has an attendance publication waiting to be delivered.
        </p>
      )}
      {Boolean(state.publication?.pending_grants) && (
        <p className="staff-attendance-caption">
          Staff access synchronization is pending on the backend.
        </p>
      )}
      {(state.phase === 'disabled' ||
        state.phase === 'unavailable' ||
        state.phase === 'stale') && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setState({ phase: 'connecting' });
            setAttempt((n) => n + 1);
          }}
        >
          Reconnect live updates
        </Button>
      )}
    </>
  );
}
export default function LiveAttendance(props: Props) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(
    () => document.visibilityState !== 'hidden' && navigator.onLine,
  );
  useEffect(() => {
    const activity = () =>
      setAvailable(document.visibilityState !== 'hidden' && navigator.onLine);
    document.addEventListener('visibilitychange', activity);
    window.addEventListener('online', activity);
    window.addEventListener('offline', activity);
    return () => {
      document.removeEventListener('visibilitychange', activity);
      window.removeEventListener('online', activity);
      window.removeEventListener('offline', activity);
    };
  }, []);
  return (
    <section
      className="staff-attendance-live"
      aria-labelledby="live-attendance-title"
    >
      <div className="staff-attendance-toolbar">
        <h3 id="live-attendance-title">Live updates</h3>
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={enabled}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? 'Turn off live updates' : 'Enable live updates'}
        </Button>
      </div>
      {!enabled ? (
        <p>
          Live updates are off. Refresh attendance to load the latest records.
        </p>
      ) : available ? (
        <ActiveFeed {...props} />
      ) : (
        <p role="status">
          Live updates paused while this tab is hidden or your device is
          offline.
        </p>
      )}
      <p className="staff-attendance-caption">
        The feed refreshes authorized counts and student rows with the current
        filters and page. It does not track physical location. Live updates stop
        when you leave this page.
      </p>
    </section>
  );
}
