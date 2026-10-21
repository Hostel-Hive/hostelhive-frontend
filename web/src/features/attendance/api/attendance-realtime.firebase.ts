import { onAuthStateChanged } from 'firebase/auth';
import { configuredAuth } from '../../auth/api/auth.api';
import { AttendanceError } from './student-attendance.api';
import {
  attendanceProjection,
  realtimeUnavailable,
} from './attendance-realtime.api';
import type {
  AttendanceProjection,
  RealtimeSession,
} from './attendance-realtime.api';

export interface FeedCallbacks {
  connected: (connected: boolean) => void;
  projection: (projection: AttendanceProjection) => void;
  error: (reason: unknown) => void;
}
export async function subscribeAttendance(
  uid: string,
  session: RealtimeSession,
  signal: AbortSignal,
  callbacks: FeedCallbacks,
): Promise<() => void> {
  const auth = configuredAuth();
  const sessionError = () =>
    new AttendanceError('session', 'Your session has changed. Sign in again.');
  if (!auth) throw sessionError();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw sessionError();
  // Use the existing signed-in Firebase app; never create an anonymous client.
  const { getDatabase, goOnline, goOffline, ref, onValue } =
    await import('firebase/database');
  if (signal.aborted) return () => {};
  if (auth.currentUser !== user) throw sessionError();
  const database = getDatabase(auth.app, session.database_url);
  let active = true;
  const detach: (() => void)[] = [];
  const stop = () => {
    if (!active) return;
    active = false;
    signal.removeEventListener('abort', stop);
    detach.splice(0).forEach((unsubscribe) => unsubscribe());
    // This feature owns the app's RTDB connection. Stop background reconnects.
    goOffline(database);
  };
  const fail = (error: unknown) => {
    if (!active) return;
    stop();
    callbacks.error(error);
  };
  const owned = () => {
    if (!active || signal.aborted) return false;
    if (auth.currentUser !== user) {
      fail(sessionError());
      return false;
    }
    return true;
  };
  const track = (unsubscribe: () => void) => {
    if (active) detach.push(unsubscribe);
    else unsubscribe();
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    goOnline(database);
    track(
      onAuthStateChanged(auth, (current) => {
        if (current !== user) fail(sessionError());
      }),
    );
    if (!active) return stop;
    track(
      onValue(
        ref(database, '.info/connected'),
        (snapshot) => {
          if (owned()) callbacks.connected(snapshot.val() === true);
        },
        () => fail(realtimeUnavailable()),
      ),
    );
    if (!active) return stop;
    track(
      onValue(
        ref(database, session.path),
        (snapshot) => {
          if (!owned()) return;
          // An empty projection means the first backend publication is still pending.
          if (snapshot.val() === null) return;
          try {
            callbacks.projection(attendanceProjection(snapshot.val()));
          } catch (error) {
            fail(error);
          }
        },
        () => fail(realtimeUnavailable()),
      ),
    );
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
