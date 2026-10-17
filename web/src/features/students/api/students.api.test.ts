import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import {
  directoryQuery,
  getStudent,
  listStudents,
  studentError,
  createStudent,
  updateStudent,
  archiveStudent,
} from './students.api';
import { normalizeStudent } from '../student.schema';
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
  it('archives with a bearer-authorized empty DELETE and accepts 204 without parsing JSON', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      archiveStudent(studentFixture.student_id, user.uid, signal()),
    ).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `/backend-api/api/v1/students/${studentFixture.student_id}`,
    );
    expect(options).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
      cache: 'no-store',
      credentials: 'omit',
    });
    expect(options).not.toHaveProperty('body');
  });
  it('rejects an invalid archive ID before requesting credentials or fetching', async () => {
    await expect(
      archiveStudent('not-an-id', user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'not-found' });
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'session'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [503, 'unavailable'],
  ] as const)(
    'handles archive HTTP %s without retrying',
    async (status, kind) => {
      fetchMock.mockResolvedValue(
        new Response('private service error', { status }),
      );
      await expect(
        archiveStudent(studentFixture.student_id, user.uid, signal()),
      ).rejects.toMatchObject({ kind });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it('does not claim archive success for an unexpected success status or network failure', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(
      archiveStudent(studentFixture.student_id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    fetchMock.mockRejectedValue(new TypeError('network failed'));
    await expect(
      archiveStudent(studentFixture.student_id, user.uid, signal()),
    ).rejects.toThrow('network failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('creates and edits using the existing authorized JSON contracts', async () => {
    const input = normalizeStudent({
      ...studentFixture,
      guardians: studentFixture.guardians!,
    });
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify(studentFixture)),
    );
    expect(await createStudent(input, user.uid, signal())).toEqual(
      studentFixture,
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/backend-api/api/v1/students',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }),
    );
    const { user_id: accountID, ...details } = input;
    expect(accountID).toBe(studentFixture.user_id);
    await updateStudent(studentFixture.student_id, details, user.uid, signal());
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/backend-api/api/v1/students/${studentFixture.student_id}`,
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(details) }),
    );
  });
  it.each([
    ['duplicate_student', 'duplicate'],
    ['active_student_account_required', 'account'],
  ])('maps save conflict %s', async (code, kind) => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: code }), { status: 409 }),
    );
    const input = normalizeStudent({
      ...studentFixture,
      guardians: studentFixture.guardians!,
    });
    await expect(
      createStudent(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind });
  });
  it('rejects invalid save IDs and mismatched mutation responses', async () => {
    const input = normalizeStudent({
      ...studentFixture,
      guardians: studentFixture.guardians!,
    });
    await expect(
      createStudent({ ...input, user_id: 'bad' }, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    await expect(
      updateStudent('bad', input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...studentFixture, user_id: 'other' })),
    );
    await expect(
      createStudent(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            ...studentFixture,
            student_id: '44444444-4444-4444-8444-444444444444',
          }),
        ),
    );
    await expect(
      updateStudent(studentFixture.student_id, input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
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
