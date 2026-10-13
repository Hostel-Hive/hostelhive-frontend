import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import {
  directoryQuery,
  getStudent,
  listStudents,
  studentError,
} from './students.api';
import {
  studentFixture,
  studentPageFixture,
} from '../../../test/fixtures/student';

vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff-uid', getIdToken: vi.fn() };
const auth = {
  authStateReady: vi.fn(),
  currentUser: user as typeof user | null,
};
const fetchMock = vi.fn();
function query() {
  return new URLSearchParams();
}
function signal() {
  return new AbortController().signal;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
  auth.currentUser = user;
  auth.authStateReady.mockResolvedValue(undefined);
  user.getIdToken.mockResolvedValue('test-token');
  fetchMock.mockResolvedValue(new Response(JSON.stringify(studentPageFixture)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('student API contract', () => {
  it('sends a fresh Firebase token and only supported encoded query parameters', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...studentPageFixture, offset: 20 })),
    );
    await listStudents(
      new URLSearchParams({
        q: ' Alex & Morgan ',
        faculty: ' Science ',
        year: '2',
        offset: '20',
        unsupported: 'ignored',
      }),
      user.uid,
      signal(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/backend-api/api/v1/students?limit=20&offset=20&q=Alex+%26+Morgan&faculty=Science&year=2',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
        cache: 'no-store',
        credentials: 'omit',
      }),
    );
    await listStudents(query(), user.uid, signal());
    expect(user.getIdToken).toHaveBeenCalledTimes(2);
  });
  it('uses the configured production base and loads a matching profile', async () => {
    vi.stubEnv('DEV', false);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(studentFixture)));
    expect(
      await getStudent(studentFixture.student_id, user.uid, signal()),
    ).toEqual(studentFixture);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/students/${studentFixture.student_id}`,
      expect.any(Object),
    );
  });
  it.each([401, 403, 404, 400, 503])(
    'maps HTTP %s without exposing backend errors',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('{"error":"private details"}', { status }),
      );
      await expect(
        listStudents(query(), user.uid, signal()),
      ).rejects.toMatchObject({
        kind: (
          {
            401: 'session',
            403: 'forbidden',
            404: 'not-found',
            400: 'invalid',
            503: 'unavailable',
          } as Record<number, string>
        )[status],
      });
    },
  );
  it('blocks missing or mismatched Firebase users before fetching', async () => {
    auth.currentUser = null;
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    auth.currentUser = user;
    await expect(
      listStudents(query(), 'another-user', signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    vi.mocked(configuredAuth).mockReturnValue(null);
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not fetch or return records after the Firebase identity changes', async () => {
    user.getIdToken.mockImplementation(async () => {
      auth.currentUser = null;
      return 'old-token';
    });
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    expect(fetchMock).not.toHaveBeenCalled();
    user.getIdToken.mockResolvedValue('new-token');
    auth.currentUser = user;
    fetchMock.mockImplementation(async () => {
      auth.currentUser = null;
      return new Response(JSON.stringify(studentPageFixture));
    });
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
  });
  it('handles token failures and uses safe network errors', async () => {
    user.getIdToken.mockRejectedValue({ code: 'auth/user-token-expired' });
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    user.getIdToken.mockRejectedValue(new Error('private token details'));
    await expect(
      listStudents(query(), user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(studentError(new Error('private network details')).message).toBe(
      'Unable to load student records. Please try again.',
    );
  });
  it.each([
    { year: '11' },
    { offset: '-1' },
    { offset: '1000001' },
    { q: 'x'.repeat(201) },
    { faculty: 'x'.repeat(121) },
  ])(
    'rejects invalid filters %j before calling the backend',
    async (params) => {
      await expect(
        listStudents(
          new URLSearchParams(
            Object.entries(params).map(([key, value]) => [key, String(value)]),
          ),
          user.uid,
          signal(),
        ),
      ).rejects.toMatchObject({ kind: 'invalid' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('normalizes defaults and rejects malformed page/profile responses', async () => {
    expect(directoryQuery(query()).toString()).toBe('limit=20&offset=0');
    for (const response of [
      { ...studentPageFixture, offset: 20 },
      {
        ...studentPageFixture,
        students: [{ ...studentFixture, account_active: 'yes' }],
      },
      { ...studentPageFixture, students: null },
    ]) {
      fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
      await expect(
        listStudents(query(), user.uid, signal()),
      ).rejects.toMatchObject({ kind: 'unavailable' });
    }
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...studentFixture,
          guardians: [{ name: 'Missing fields' }],
        }),
      ),
    );
    await expect(
      getStudent(studentFixture.student_id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...studentFixture,
          student_id: '44444444-4444-4444-8444-444444444444',
        }),
      ),
    );
    await expect(
      getStudent(studentFixture.student_id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('rejects an invalid profile ID without a network request and accepts omitted guardians', async () => {
    await expect(
      getStudent('not-an-id', user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...studentFixture, guardians: undefined })),
    );
    expect(
      (await getStudent(studentFixture.student_id, user.uid, signal()))
        .guardians,
    ).toBeUndefined();
  });
});
