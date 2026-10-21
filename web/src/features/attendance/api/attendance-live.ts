import {
  createRealtimeSession,
  getPublicationStatus,
  realtimeUnavailable,
} from './attendance-realtime.api';
import type {
  AttendanceProjection,
  PublicationStatus,
  RealtimeSession,
} from './attendance-realtime.api';
import { subscribeAttendance } from './attendance-realtime.firebase';
import { attendanceError } from './student-attendance.api';
import type { AttendanceError } from './student-attendance.api';

export interface LiveAttendanceState {
  phase:
    | 'connecting'
    | 'waiting'
    | 'live'
    | 'reconnecting'
    | 'stale'
    | 'disabled'
    | 'unavailable';
  projection?: AttendanceProjection;
  publication?: PublicationStatus;
  message?: string;
}
export interface LiveCallbacks {
  state: (state: LiveAttendanceState) => void;
  invalidate: () => void;
  denied: (error: AttendanceError) => void;
}
// One visible attendance dashboard owns this lifecycle. All timers, HTTP reads,
// listeners and delayed invalidations end together on stop/account change.
export function startAttendanceLive(
  uid: string,
  callbacks: LiveCallbacks,
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let active = true;
  let connected = false;
  let everConnected = false;
  let projection: AttendanceProjection | undefined;
  let publication: PublicationStatus | undefined;
  let session: RealtimeSession;
  let unsubscribe: (() => void) | undefined;
  let renewTimer: ReturnType<typeof setTimeout>;
  let expiryTimer: ReturnType<typeof setTimeout>;
  let statusTimer: ReturnType<typeof setTimeout>;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval>;
  const stop = () => {
    if (!active) return;
    active = false;
    controller.abort();
    unsubscribe?.();
    clearTimeout(renewTimer);
    clearTimeout(expiryTimer);
    clearTimeout(statusTimer);
    clearTimeout(refreshTimer);
    clearInterval(clockTimer);
  };
  const fail = (reason: unknown) => {
    if (!active) return;
    const error = attendanceError(reason);
    stop();
    if (error.kind === 'session' || error.kind === 'forbidden')
      callbacks.denied(error);
    else {
      callbacks.state({ phase: 'unavailable', message: error.message });
      // A cancelled Firebase grant may mean access changed. Recheck through the
      // authorized REST reads; never keep a listener alive to recover access.
      callbacks.invalidate();
    }
  };
  const emit = () => {
    if (!active) return;
    const phase = !connected
      ? everConnected
        ? 'reconnecting'
        : 'connecting'
      : !projection
        ? 'waiting'
        : Date.now() - projection.published_at > 90000
          ? 'stale'
          : 'live';
    callbacks.state({ phase, projection, publication });
  };
  const invalidate = () => {
    if (!active || !connected || refreshTimer !== undefined) return;
    // Coalesce initial value/connection callbacks and bursts of scanner activity.
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (active && connected) callbacks.invalidate();
    }, 1500);
  };
  const disabled = () => {
    stop();
    callbacks.state({ phase: 'disabled' });
  };
  async function pollStatus() {
    try {
      const next = await getPublicationStatus(uid, signal);
      if (!active) return;
      if (!next.enabled) {
        disabled();
        return;
      }
      publication = next;
      emit();
      statusTimer = setTimeout(() => void pollStatus(), 30000);
    } catch (error) {
      fail(error);
    }
  }
  function scheduleGrant() {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(
      () => fail(realtimeUnavailable()),
      Math.max(0, Date.parse(session.expires_at) - Date.now()),
    );
    renewTimer = setTimeout(
      () => void renew(),
      session.renew_after_seconds * 1000,
    );
  }
  async function renew() {
    try {
      const next = await createRealtimeSession(uid, signal);
      if (!active) return;
      if (
        next.database_url !== session.database_url ||
        next.path !== session.path
      )
        throw realtimeUnavailable();
      session = next;
      scheduleGrant();
    } catch (error) {
      fail(error);
    }
  }
  async function start() {
    publication = await getPublicationStatus(uid, signal);
    if (!active) return;
    if (!publication.enabled) {
      disabled();
      return;
    }
    session = await createRealtimeSession(uid, signal);
    if (!active) return;
    scheduleGrant();
    const detach = await subscribeAttendance(uid, session, signal, {
      connected(value) {
        if (!active) return;
        const reconnected = value && !connected;
        connected = value;
        if (value) everConnected = true;
        else {
          clearTimeout(refreshTimer);
          refreshTimer = undefined;
        }
        emit();
        if (reconnected) invalidate();
      },
      projection(next) {
        if (!active || (projection && next.version <= projection.version))
          return;
        projection = next;
        emit();
        invalidate();
      },
      error: fail,
    });
    if (!active) {
      detach();
      return;
    }
    unsubscribe = detach;
    clockTimer = setInterval(emit, 10000);
    statusTimer = setTimeout(() => void pollStatus(), 30000);
  }
  void start().catch(fail);
  return stop;
}
