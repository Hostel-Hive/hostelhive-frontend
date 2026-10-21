import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import {
  attendanceProjection,
  createRealtimeSession,
  getPublicationStatus,
} from './attendance-realtime.api';
import {
  liveProjection,
  publicationStatus,
  realtimeSession,
} from '../../../test/fixtures/attendanceRealtime';
vi.mock('../../auth/api/authorized-request', () => ({
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
});
afterEach(() => vi.useRealTimers());
it('requests an empty-body staff grant and validates the returned Firebase destination', async () => {
  request.mockResolvedValue(Response.json(realtimeSession()));
  expect(await createRealtimeSession('uid', signal())).toEqual(
    realtimeSession(),
  );
  expect(request).toHaveBeenCalledWith(
    '/api/v1/attendance/realtime/session',
    'uid',
    expect.any(AbortSignal),
    { method: 'POST' },
  );
});
it.each([
  'https://test.firebaseio.com',
  'https://test-default-rtdb.firebasedatabase.app/',
])('accepts supported Firebase roots: %s', async (database_url) => {
  request.mockResolvedValue(
    Response.json({ ...realtimeSession(), database_url }),
  );
  expect((await createRealtimeSession('uid', signal())).database_url).toBe(
    database_url.replace(/\/$/, ''),
  );
});
it.each([
  { database_url: 'http://test.firebaseio.com' },
  { database_url: 'not-url' },
  { database_url: 'https://test.firebaseio.com.evil.test' },
  { database_url: 'https://evil.test' },
  { database_url: 'https://test.firebaseio.com:444' },
  { database_url: 'https://user:secret@test.firebaseio.com' },
  { database_url: 'https://test.firebaseio.com/path' },
  { database_url: 'https://test.firebaseio.com?auth=secret' },
  { database_url: 'https://test.firebaseio.com#fragment' },
  { database_url: null },
  { path: '/' },
  { path: 'hostelhive/staffAccess/uid' },
  { expires_at: 'invalid' },
  { expires_at: '2026-10-21T05:59:59Z' },
  { expires_at: '2026-10-22T06:00:00Z' },
  { renew_after_seconds: 0 },
  { renew_after_seconds: 300 },
  { renew_after_seconds: 1.5 },
])('rejects untrusted grant fields %#', async (fields) => {
  request.mockResolvedValue(Response.json({ ...realtimeSession(), ...fields }));
  await expect(createRealtimeSession('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects a missing grant and an aborted response', async () => {
  request.mockResolvedValueOnce(Response.json(null));
  await expect(createRealtimeSession('uid', signal())).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValue(Response.json(realtimeSession()));
  await expect(
    createRealtimeSession('uid', controller.signal),
  ).rejects.toThrow();
});
it('reads publication status without queries, UID overrides or a body', async () => {
  request.mockResolvedValue(Response.json(publicationStatus()));
  expect(await getPublicationStatus('uid', signal())).toEqual(
    publicationStatus(),
  );
  expect(request).toHaveBeenCalledWith(
    '/api/v1/attendance/realtime/status',
    'uid',
    expect.any(AbortSignal),
    undefined,
  );
  const unpublished = {
    ...publicationStatus(),
    enabled: false,
    pending: true,
    published_at: null,
    published_version: null,
  };
  request.mockResolvedValue(Response.json(unpublished));
  expect(await getPublicationStatus('uid', signal())).toEqual(unpublished);
});
it.each([
  { enabled: 'true' },
  { pending: 1 },
  { version: -1 },
  { version: Number.MAX_SAFE_INTEGER + 1 },
  { published_version: 101 },
  { published_version: null },
  { published_at: null },
  { published_at: 'yesterday' },
  { changed_at: '' },
  { attempts: -1 },
  { pending_grants: 0.5 },
])('rejects invalid publication metadata %#', async (fields) => {
  request.mockResolvedValue(
    Response.json({ ...publicationStatus(), ...fields }),
  );
  await expect(getPublicationStatus('uid', signal())).rejects.toThrow();
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'unavailable'],
  [503, 'unavailable'],
  [500, 'unavailable'],
])(
  'maps HTTP %s without displaying provider error bodies',
  async (status, kind) => {
    request.mockResolvedValue(
      new Response('private provider detail', { status: status as number }),
    );
    await expect(createRealtimeSession('uid', signal())).rejects.toMatchObject({
      kind,
    });
    await expect(getPublicationStatus('uid', signal())).rejects.not.toThrow(
      'private provider detail',
    );
  },
);
it('strips unexpected identity data from the aggregate projection', () => {
  expect(
    attendanceProjection({
      ...liveProjection(),
      student_name: 'private',
      summary: { ...liveProjection().summary, email: 'private' },
    }),
  ).toEqual(liveProjection());
});
it.each([
  null,
  [],
  { version: -1 },
  { version: 1.2 },
  { changed_at: 'time' },
  { published_at: Date.parse('2026-10-22T06:00:00Z') },
  { published_at: 1 },
  { summary: null },
  { summary: { total: 10, in: 10, out: 1, unknown: 0 } },
  { summary: { total: 10, in: -1, out: 10, unknown: 1 } },
])('rejects malformed projection %#', (fields) => {
  expect(() =>
    attendanceProjection(
      fields === null || Array.isArray(fields)
        ? fields
        : { ...liveProjection(), ...fields },
    ),
  ).toThrow();
});
