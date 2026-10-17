import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { getStudentImportTemplate, importStudents } from './student-import.api';
import { STUDENT_CSV_COLUMNS, MAX_CSV_BYTES } from '../student-import';
import {
  importReportFixture,
  makeCSV,
} from '../../../test/fixtures/student-import';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'admin-uid', getIdToken: vi.fn() };
const auth = {
  currentUser: user as typeof user | null,
  authStateReady: vi.fn(),
};
const fetchMock = vi.fn();
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
it('downloads the authenticated server template using no-store', async () => {
  fetchMock.mockResolvedValue(
    new Response(STUDENT_CSV_COLUMNS.join(',') + '\r\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    }),
  );
  expect((await getStudentImportTemplate(user.uid, signal())).type).toBe(
    'text/csv;charset=utf-8',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/backend-api/api/v1/students/import/template',
    expect.objectContaining({
      headers: { Authorization: 'Bearer private-token' },
      cache: 'no-store',
      credentials: 'omit',
    }),
  );
});
it('sends raw CSV bytes, not JSON/multipart, and reads the partial report', async () => {
  const file = new File([makeCSV()], 'students.csv', {
    type: 'application/vnd.ms-excel',
  });
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(importReportFixture)),
  );
  await expect(importStudents(file, user.uid, signal())).resolves.toEqual(
    importReportFixture,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/backend-api/api/v1/students/import',
    expect.objectContaining({
      method: 'POST',
      body: file,
      headers: {
        Authorization: 'Bearer private-token',
        'Content-Type': 'text/csv; charset=utf-8',
      },
      cache: 'no-store',
      credentials: 'omit',
    }),
  );
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [413, 'invalid'],
  [415, 'invalid'],
  [503, 'unavailable'],
] as const)('handles import HTTP %s without a retry', async (status, kind) => {
  fetchMock.mockResolvedValue(new Response('private server error', { status }));
  await expect(
    importStudents(new File(['x'], 'x.csv'), user.uid, signal()),
  ).rejects.toMatchObject({ kind });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it('rejects oversized and empty imports before requesting credentials', async () => {
  const file = new File(['x'], 'x.csv');
  Object.defineProperty(file, 'size', { value: MAX_CSV_BYTES + 1 });
  await expect(importStudents(file, user.uid, signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(
    importStudents(new File([], 'x.csv'), user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects malformed reports and unexpected successful statuses', async () => {
  fetchMock.mockResolvedValue(new Response('{}'));
  await expect(
    importStudents(new File(['x'], 'x.csv'), user.uid, signal()),
  ).rejects.toThrow('could not be verified');
  fetchMock.mockResolvedValue(new Response('{}', { status: 202 }));
  await expect(
    importStudents(new File(['x'], 'x.csv'), user.uid, signal()),
  ).rejects.toThrow('could not be verified');
});
it('rejects invalid template content without exposing arbitrary response text', async () => {
  for (const response of [
    new Response('secret'),
    new Response('secret', { headers: { 'Content-Type': 'text/csv' } }),
  ]) {
    fetchMock.mockResolvedValue(response);
    await expect(getStudentImportTemplate(user.uid, signal())).rejects.toThrow(
      'Template unavailable',
    );
  }
});
it('rejects changed or missing Firebase sessions without submitting data', async () => {
  await expect(
    importStudents(new File(['x'], 'x.csv'), 'different-user', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  expect(fetchMock).not.toHaveBeenCalled();
  auth.currentUser = null;
  await expect(
    getStudentImportTemplate(user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'session' });
});
