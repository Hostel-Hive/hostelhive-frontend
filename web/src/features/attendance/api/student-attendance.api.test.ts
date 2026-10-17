import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { getStudentPresence, getStudentScans } from './student-attendance.api';
import { studentFixture } from '../../../test/fixtures/student';
import {
  presenceFixture,
  scanFixture,
  scanPage,
  twentyScans,
} from '../../../test/fixtures/attendance';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff', getIdToken: vi.fn() };
const auth = {
  currentUser: user as typeof user | null,
  authStateReady: vi.fn(),
};
const fetchMock = vi.fn();
const id = studentFixture.student_id;
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  auth.currentUser = user;
  user.getIdToken.mockResolvedValue('private-token');
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('reads authoritative presence through the staff endpoint with a current bearer token and no body', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(presenceFixture)));
  await expect(getStudentPresence(id, user.uid, signal())).resolves.toEqual(
    presenceFixture,
  );
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(`/backend-api/api/v1/attendance/presence?student_id=${id}`);
  expect(options).toMatchObject({
    headers: { Authorization: 'Bearer private-token' },
    cache: 'no-store',
    credentials: 'omit',
  });
  expect(options).not.toHaveProperty('body');
  expect(options).not.toHaveProperty('method');
});
it('requests paginated audit scans without unsupported report filters or invented totals', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(scanPage([scanFixture], 20))),
  );
  const data = await getStudentScans(id, user.uid, signal(), 20);
  expect(data).not.toHaveProperty('total');
  expect(fetchMock.mock.calls[0][0]).toBe(
    `/backend-api/api/v1/attendance/events?student_id=${id}&limit=20&offset=20`,
  );
});
it('uses the production API configuration without leaking tokens in URLs', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
  fetchMock.mockResolvedValue(new Response(JSON.stringify(presenceFixture)));
  await getStudentPresence(id, user.uid, signal());
  expect(fetchMock.mock.calls[0][0]).toBe(
    `https://api.example.com/api/v1/attendance/presence?student_id=${id}`,
  );
});
it.each(['IN', 'OUT', 'UNKNOWN'] as const)(
  'accepts %s presence without inferring a state from history',
  async (status) => {
    const value = {
      ...presenceFixture,
      status,
      updated_at: status === 'UNKNOWN' ? null : presenceFixture.updated_at,
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(getStudentPresence(id, user.uid, signal())).resolves.toEqual(
      value,
    );
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)(
  'handles HTTP %s with safe messages and no automatic retries',
  async (status, kind) => {
    fetchMock.mockResolvedValue(
      new Response('private server details', { status }),
    );
    await expect(
      getStudentPresence(id, user.uid, signal()),
    ).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it('rejects missing, mismatched or contradictory presence fields', async () => {
  for (const value of [
    null,
    {},
    { ...presenceFixture, student_id: studentFixture.user_id },
    { ...presenceFixture, status: 'MISSING' },
    { ...presenceFixture, updated_at: null },
    { ...presenceFixture, updated_at: 'yesterday' },
    { ...presenceFixture, status: 'UNKNOWN' },
  ]) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(
      getStudentPresence(id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('keeps recorded and ignored outcomes distinct and preserves optional permission assessments', async () => {
  const outcomes = [
    'recorded',
    'cooldown',
    'already_in',
    'already_out',
  ] as const;
  const access = [
    'approved',
    'not_evaluated',
    'not_required',
    'unapproved',
  ] as const;
  const rows = outcomes.map((outcome, i) => ({
    ...scanFixture,
    outcome,
    event_id: twentyScans()[i].event_id,
    access_result: access[i],
  }));
  fetchMock.mockResolvedValue(new Response(JSON.stringify(scanPage(rows))));
  await expect(getStudentScans(id, user.uid, signal())).resolves.toMatchObject({
    items: rows,
  });
});
it('accepts reused event IDs on different scanners but rejects duplicate complete identities', async () => {
  const other = { ...scanFixture, device_id: studentFixture.user_id };
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(scanPage([scanFixture, other]))),
  );
  expect((await getStudentScans(id, user.uid, signal())).items).toHaveLength(2);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(scanPage([scanFixture, scanFixture]))),
  );
  await expect(getStudentScans(id, user.uid, signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('accepts complete next pages and empty out-of-range pages', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(scanPage(twentyScans(), 0, true))),
  );
  expect((await getStudentScans(id, user.uid, signal())).has_more).toBe(true);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(scanPage([], 100))));
  expect((await getStudentScans(id, user.uid, signal(), 100)).items).toEqual(
    [],
  );
});
it('rejects malformed page metadata, IDs, direction, outcome, timestamp and access fields', async () => {
  const malformed = [
    { ...scanFixture, student_id: studentFixture.user_id },
    { ...scanFixture, device_id: 'invalid' },
    { ...scanFixture, event_id: 'invalid' },
    { ...scanFixture, direction: 'LEFT' },
    { ...scanFixture, outcome: 'success' },
    { ...scanFixture, occurred_at: 'invalid' },
    { ...scanFixture, access_result: 'private raw text' },
    { ...scanFixture, late_access_id: 'bad' },
    { ...scanFixture, incident_id: 'bad' },
  ];
  for (const value of [
    {},
    null,
    scanPage([scanFixture], 20),
    { ...scanPage(), limit: 100 },
    { ...scanPage(), has_more: 'true' },
    scanPage([scanFixture], 0, true),
    ...malformed.map((row) => scanPage([row as typeof scanFixture])),
  ]) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(getStudentScans(id, user.uid, signal())).rejects.toMatchObject(
      { kind: 'unavailable' },
    );
  }
});
it('discards unrecognized private response fields', async () => {
  const raw = { ...scanFixture, raw_qr: 'private' };
  fetchMock.mockResolvedValue(new Response(JSON.stringify(scanPage([raw]))));
  const page = await getStudentScans(id, user.uid, signal());
  expect(page.items[0]).not.toHaveProperty('raw_qr');
});
it('rejects invalid IDs, nil IDs and invalid offsets before authentication', async () => {
  await expect(
    getStudentPresence('not-a-uuid', user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    getStudentPresence(
      '00000000-0000-0000-0000-000000000000',
      user.uid,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  for (const offset of [-1, 1.5, 1000001])
    await expect(
      getStudentScans(id, user.uid, signal(), offset),
    ).rejects.toMatchObject({ kind: 'invalid' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects a different, missing or changed Firebase session', async () => {
  await expect(
    getStudentPresence(id, 'other-user', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  auth.currentUser = null;
  await expect(getStudentScans(id, user.uid, signal())).rejects.toMatchObject({
    kind: 'session',
  });
  expect(fetchMock).not.toHaveBeenCalled();
  auth.currentUser = user;
  fetchMock.mockImplementation(async () => {
    auth.currentUser = null;
    return new Response(JSON.stringify(presenceFixture));
  });
  await expect(
    getStudentPresence(id, user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'session' });
});
