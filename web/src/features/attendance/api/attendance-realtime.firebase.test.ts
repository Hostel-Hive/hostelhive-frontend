import { beforeEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { subscribeAttendance } from './attendance-realtime.firebase';
import {
  liveProjection,
  realtimeSession,
} from '../../../test/fixtures/attendanceRealtime';
const sdk = vi.hoisted(() => ({
  ready: vi.fn(),
  currentUser: { uid: 'uid' } as { uid: string } | null,
  app: { name: 'existing-app' },
  getDatabase: vi.fn(),
  goOnline: vi.fn(),
  goOffline: vi.fn(),
  ref: vi.fn(),
  onValue: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
vi.mock('firebase/database', () => ({
  getDatabase: sdk.getDatabase,
  goOnline: sdk.goOnline,
  goOffline: sdk.goOffline,
  ref: sdk.ref,
  onValue: sdk.onValue,
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: sdk.onAuthStateChanged,
}));
type Listener = {
  value: (snapshot: { val: () => unknown }) => void;
  error: () => void;
  detach: ReturnType<typeof vi.fn>;
};
let listeners: Map<string, Listener>;
let authChanged: (user: typeof sdk.currentUser) => void;
const authDetach = vi.fn();
const handlers = { connected: vi.fn(), projection: vi.fn(), error: vi.fn() };
const database = {};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.currentUser = { uid: 'uid' };
  listeners = new Map();
  sdk.ready.mockResolvedValue(undefined);
  vi.mocked(configuredAuth).mockReturnValue({
    currentUser: sdk.currentUser,
    app: sdk.app,
    authStateReady: sdk.ready,
  } as unknown as NonNullable<ReturnType<typeof configuredAuth>>);
  sdk.getDatabase.mockReturnValue(database);
  sdk.ref.mockImplementation((_db, path) => path);
  sdk.onValue.mockImplementation((path, value, error) => {
    const detach = vi.fn();
    listeners.set(path, { value, error, detach });
    return detach;
  });
  sdk.onAuthStateChanged.mockImplementation((_auth, callback) => {
    authChanged = callback;
    return authDetach;
  });
});
async function subscribe(controller = new AbortController()) {
  const stop = await subscribeAttendance(
    'uid',
    realtimeSession(),
    controller.signal,
    handlers,
  );
  return { stop, controller };
}
it('uses the existing signed-in app and only the attendance and connection nodes', async () => {
  const { stop } = await subscribe();
  expect(sdk.getDatabase).toHaveBeenCalledWith(
    sdk.app,
    realtimeSession().database_url,
  );
  expect([...listeners.keys()]).toEqual([
    '.info/connected',
    'hostelhive/attendance',
  ]);
  listeners.get('.info/connected')!.value({ val: () => true });
  expect(handlers.connected).toHaveBeenCalledWith(true);
  const projection = liveProjection();
  listeners.get('hostelhive/attendance')!.value({ val: () => projection });
  expect(handlers.projection).toHaveBeenCalledWith(projection);
  stop();
  stop();
  expect(sdk.goOffline).toHaveBeenCalledTimes(1);
  expect(authDetach).toHaveBeenCalledTimes(1);
  for (const listener of listeners.values())
    expect(listener.detach).toHaveBeenCalledTimes(1);
});
it('ignores an unpublished node without inventing empty counts', async () => {
  const { stop } = await subscribe();
  listeners.get('hostelhive/attendance')!.value({ val: () => null });
  expect(handlers.projection).not.toHaveBeenCalled();
  expect(handlers.error).not.toHaveBeenCalled();
  stop();
});
it('detaches on invalid data and ignores late cached callbacks', async () => {
  await subscribe();
  const listener = listeners.get('hostelhive/attendance')!;
  listener.value({ val: () => ({ version: 'bad' }) });
  expect(handlers.error).toHaveBeenCalledTimes(1);
  expect(sdk.goOffline).toHaveBeenCalledTimes(1);
  listener.value({ val: () => liveProjection() });
  listener.error();
  expect(handlers.error).toHaveBeenCalledTimes(1);
  expect(handlers.projection).not.toHaveBeenCalled();
});
it.each(['.info/connected', 'hostelhive/attendance'])(
  'closes on cancellation of %s',
  async (path) => {
    await subscribe();
    listeners.get(path)!.error();
    expect(handlers.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'unavailable' }),
    );
    expect(sdk.goOffline).toHaveBeenCalledTimes(1);
  },
);
it('stops before delivering data for a changed auth user', async () => {
  await subscribe();
  const auth = configuredAuth()!;
  Object.assign(auth, { currentUser: { uid: 'other' } });
  listeners
    .get('hostelhive/attendance')!
    .value({ val: () => liveProjection() });
  expect(handlers.error).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'session' }),
  );
  expect(handlers.projection).not.toHaveBeenCalled();
});
it('observes sign-out without waiting for another database event', async () => {
  await subscribe();
  authChanged(null);
  expect(handlers.error).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'session' }),
  );
  expect(sdk.goOffline).toHaveBeenCalledTimes(1);
});
it('aborts listeners and prevents later connection/data notifications', async () => {
  const { controller } = await subscribe();
  controller.abort();
  listeners.get('.info/connected')!.value({ val: () => true });
  listeners
    .get('hostelhive/attendance')!
    .value({ val: () => liveProjection() });
  expect(handlers.connected).not.toHaveBeenCalled();
  expect(handlers.projection).not.toHaveBeenCalled();
  expect(sdk.goOffline).toHaveBeenCalledTimes(1);
});
it.each(['missing-auth', 'missing-user', 'wrong-user'])(
  'rejects %s before creating a Firebase connection',
  async (mode) => {
    if (mode === 'missing-auth')
      vi.mocked(configuredAuth).mockReturnValue(null);
    else
      Object.assign(configuredAuth()!, {
        currentUser: mode === 'missing-user' ? null : { uid: 'other' },
      });
    await expect(subscribe()).rejects.toMatchObject({ kind: 'session' });
    expect(sdk.getDatabase).not.toHaveBeenCalled();
  },
);
it('does not start after abort while auth readiness is pending', async () => {
  const controller = new AbortController();
  let ready!: () => void;
  sdk.ready.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const pending = subscribe(controller);
  controller.abort();
  ready();
  const { stop } = await pending;
  stop();
  expect(sdk.getDatabase).not.toHaveBeenCalled();
});
it('rejects an account switch during auth readiness', async () => {
  sdk.ready.mockImplementation(async () =>
    Object.assign(configuredAuth()!, { currentUser: { uid: 'other' } }),
  );
  await expect(subscribe()).rejects.toMatchObject({ kind: 'session' });
  expect(sdk.getDatabase).not.toHaveBeenCalled();
});
it('cleans up when listener creation throws', async () => {
  sdk.onValue.mockImplementation(() => {
    throw new Error('SDK unavailable');
  });
  await expect(subscribe()).rejects.toThrow('SDK unavailable');
  expect(authDetach).toHaveBeenCalled();
  expect(sdk.goOffline).toHaveBeenCalled();
});
it('cleans up even if the SDK cancels synchronously while attaching a listener', async () => {
  const detach = vi.fn();
  sdk.onValue.mockImplementation((_path, _value, error) => {
    error();
    return detach;
  });
  await subscribe();
  expect(detach).toHaveBeenCalledTimes(1);
  expect(sdk.onValue).toHaveBeenCalledTimes(1);
});
