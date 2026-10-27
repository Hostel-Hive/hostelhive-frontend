import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startAttendanceLive } from './attendance-live';
import type { LiveCallbacks } from './attendance-live';
import {
  createRealtimeSession,
  getPublicationStatus,
} from './attendance-realtime.api';
import { subscribeAttendance } from './attendance-realtime.firebase';
import type { FeedCallbacks } from './attendance-realtime.firebase';
import { AttendanceError } from './student-attendance.api';
import {
  liveProjection,
  publicationStatus,
  realtimeSession,
} from '../../../test/fixtures/attendanceRealtime';
vi.mock('./attendance-realtime.api', async (original) => ({
  ...(await original<typeof import('./attendance-realtime.api')>()),
  createRealtimeSession: vi.fn(),
  getPublicationStatus: vi.fn(),
}));
vi.mock('./attendance-realtime.firebase', () => ({
  subscribeAttendance: vi.fn(),
}));
let feed: FeedCallbacks;
let callbacks: LiveCallbacks;
let stop: () => void;
const detach = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
  vi.mocked(getPublicationStatus).mockImplementation(async () =>
    publicationStatus(),
  );
  vi.mocked(createRealtimeSession).mockImplementation(async () =>
    realtimeSession(),
  );
  vi.mocked(subscribeAttendance).mockImplementation(
    async (_uid, _session, _signal, handlers) => {
      feed = handlers;
      return detach;
    },
  );
  callbacks = { state: vi.fn(), invalidate: vi.fn(), denied: vi.fn() };
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});
async function start() {
  stop = startAttendanceLive('uid', callbacks);
  await vi.advanceTimersByTimeAsync(0);
}
function latest() {
  return vi.mocked(callbacks.state).mock.lastCall?.[0];
}
it('obtains a grant before listening with the same UID and no business-data writes', async () => {
  await start();
  expect(getPublicationStatus).toHaveBeenCalledWith(
    'uid',
    expect.any(AbortSignal),
  );
  expect(createRealtimeSession).toHaveBeenCalledWith(
    'uid',
    expect.any(AbortSignal),
  );
  expect(subscribeAttendance).toHaveBeenCalledWith(
    'uid',
    realtimeSession(),
    expect.any(AbortSignal),
    expect.any(Object),
  );
  feed.connected(true);
  expect(latest()?.phase).toBe('waiting');
  feed.projection(liveProjection());
  expect(latest()?.phase).toBe('live');
});
it('coalesces initial callbacks and bursts and ignores duplicate/regressing revisions', async () => {
  await start();
  feed.connected(true);
  feed.projection(liveProjection());
  feed.projection(liveProjection(101));
  feed.projection(liveProjection(102));
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
  feed.projection(liveProjection(101));
  feed.projection(liveProjection(102));
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
  expect(latest()?.projection?.version).toBe(102);
  feed.projection(liveProjection(103));
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).toHaveBeenCalledTimes(2);
});
it('refetches on reconnect even if the projection version has not changed', async () => {
  await start();
  feed.connected(true);
  feed.projection(liveProjection());
  await vi.advanceTimersByTimeAsync(1500);
  feed.connected(false);
  expect(latest()?.phase).toBe('reconnecting');
  feed.projection(liveProjection(101));
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
  feed.connected(true);
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).toHaveBeenCalledTimes(2);
});
it('cancels a queued refresh while disconnected and reports first connection honestly', async () => {
  await start();
  feed.connected(false);
  expect(latest()?.phase).toBe('connecting');
  feed.connected(true);
  feed.connected(false);
  await vi.advanceTimersByTimeAsync(1500);
  expect(callbacks.invalidate).not.toHaveBeenCalled();
});
it('shows stale data after the heartbeat allowance and recovers on a newer publication', async () => {
  await start();
  feed.connected(true);
  feed.projection(liveProjection());
  await vi.advanceTimersByTimeAsync(100000);
  expect(latest()?.phase).toBe('stale');
  feed.projection(liveProjection(101));
  expect(latest()?.phase).toBe('live');
});
it('renews the grant while keeping one listener and checks publication health', async () => {
  await start();
  await vi.advanceTimersByTimeAsync(120000);
  expect(createRealtimeSession).toHaveBeenCalledTimes(2);
  expect(getPublicationStatus).toHaveBeenCalledTimes(5);
  expect(subscribeAttendance).toHaveBeenCalledTimes(1);
  expect(detach).not.toHaveBeenCalled();
});
it('reports queued publications and access synchronization', async () => {
  await start();
  vi.mocked(getPublicationStatus).mockResolvedValue({
    ...publicationStatus(),
    pending: true,
    pending_grants: 1,
  });
  await vi.advanceTimersByTimeAsync(30000);
  expect(latest()?.publication).toMatchObject({
    pending: true,
    pending_grants: 1,
  });
});
it('does not request a grant or read Firebase when the backend is disabled', async () => {
  vi.mocked(getPublicationStatus).mockResolvedValue({
    ...publicationStatus(),
    enabled: false,
  });
  await start();
  expect(latest()?.phase).toBe('disabled');
  expect(createRealtimeSession).not.toHaveBeenCalled();
  expect(subscribeAttendance).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300000);
  expect(getPublicationStatus).toHaveBeenCalledTimes(1);
});
it('disconnects when the backend disables live updates during a session', async () => {
  await start();
  vi.mocked(getPublicationStatus).mockResolvedValue({
    ...publicationStatus(),
    enabled: false,
  });
  await vi.advanceTimersByTimeAsync(30000);
  expect(latest()?.phase).toBe('disabled');
  expect(detach).toHaveBeenCalledTimes(1);
});
it.each(['session', 'forbidden'] as const)(
  'clears the lifecycle on API %s denial',
  async (kind) => {
    await start();
    vi.mocked(getPublicationStatus).mockRejectedValue(
      new AttendanceError(kind, 'Access denied'),
    );
    await vi.advanceTimersByTimeAsync(30000);
    expect(callbacks.denied).toHaveBeenCalledWith(
      expect.objectContaining({ kind }),
    );
    expect(detach).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(callbacks.state).mock.calls.length;
    feed.projection(liveProjection(200));
    feed.connected(true);
    await vi.advanceTimersByTimeAsync(300000);
    expect(callbacks.state).toHaveBeenCalledTimes(calls);
  },
);
it('stops immediately on Firebase cancellation and rechecks authorized rows without retry loops', async () => {
  await start();
  feed.connected(true);
  feed.error(new Error('PERMISSION_DENIED private provider body'));
  expect(latest()).toMatchObject({ phase: 'unavailable' });
  expect(latest()?.message).not.toContain('private provider body');
  expect(callbacks.invalidate).toHaveBeenCalledTimes(1);
  expect(detach).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300000);
  expect(createRealtimeSession).toHaveBeenCalledTimes(1);
});
it('stops on renewal failure and never uses an expired grant', async () => {
  await start();
  vi.mocked(createRealtimeSession).mockRejectedValue(new Error('offline'));
  await vi.advanceTimersByTimeAsync(120000);
  expect(latest()?.phase).toBe('unavailable');
  expect(detach).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300000);
  expect(createRealtimeSession).toHaveBeenCalledTimes(2);
});
it('expires even when the renewal request never settles', async () => {
  await start();
  vi.mocked(createRealtimeSession).mockImplementation(
    () => new Promise(() => {}),
  );
  await vi.advanceTimersByTimeAsync(300000);
  expect(latest()?.phase).toBe('unavailable');
  expect(detach).toHaveBeenCalledTimes(1);
  expect(vi.mocked(createRealtimeSession).mock.lastCall?.[1].aborted).toBe(
    true,
  );
});
it('rejects a changed database destination during grant renewal', async () => {
  await start();
  vi.mocked(createRealtimeSession).mockImplementation(async () => ({
    ...realtimeSession(),
    database_url: 'https://other.firebaseio.com',
  }));
  await vi.advanceTimersByTimeAsync(120000);
  expect(latest()?.phase).toBe('unavailable');
  expect(detach).toHaveBeenCalled();
});
it('aborts reads, detaches and cancels queued refreshes on explicit stop', async () => {
  await start();
  feed.connected(true);
  feed.projection(liveProjection());
  stop();
  stop();
  expect(detach).toHaveBeenCalledTimes(1);
  expect(vi.mocked(subscribeAttendance).mock.calls[0][2].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(300000);
  expect(callbacks.invalidate).not.toHaveBeenCalled();
  expect(callbacks.denied).not.toHaveBeenCalled();
});
it('ignores late status, grant and listener completions after stop', async () => {
  let resolveStatus!: (v: ReturnType<typeof publicationStatus>) => void;
  vi.mocked(getPublicationStatus).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
  );
  stop = startAttendanceLive('uid', callbacks);
  stop();
  resolveStatus(publicationStatus());
  await vi.advanceTimersByTimeAsync(0);
  expect(createRealtimeSession).not.toHaveBeenCalled();
  let resolveGrant!: (v: ReturnType<typeof realtimeSession>) => void;
  vi.mocked(createRealtimeSession).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveGrant = resolve;
      }),
  );
  stop = startAttendanceLive('uid', callbacks);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  resolveGrant(realtimeSession());
  await vi.advanceTimersByTimeAsync(0);
  expect(subscribeAttendance).not.toHaveBeenCalled();
  let resolveListener!: (v: () => void) => void;
  vi.mocked(subscribeAttendance).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveListener = resolve;
      }),
  );
  stop = startAttendanceLive('uid', callbacks);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  resolveListener(detach);
  await vi.advanceTimersByTimeAsync(0);
  expect(detach).toHaveBeenCalledTimes(1);
  expect(callbacks.state).not.toHaveBeenCalled();
});
