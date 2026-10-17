import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { studentFixture } from '../../../test/fixtures/student';
import { getStudentQR } from './student-qr.api';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff', getIdToken: vi.fn() };
const auth = {
  currentUser: user as typeof user | null,
  authStateReady: vi.fn(),
};
const fetchMock = vi.fn();
const id = studentFixture.student_id;
const signal = () => new AbortController().signal;
const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]), {
    headers: { 'Content-Type': 'image/png' },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  auth.currentUser = user;
  user.getIdToken.mockResolvedValue('private-token');
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
  fetchMock.mockImplementation(png);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('fetches the canonical staff PNG endpoint with a bearer token and no body or query', async () => {
  const blob = await getStudentQR(id, user.uid, signal());
  expect(blob.type).toBe('image/png');
  expect(blob.size).toBe(9);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(`/backend-api/api/v1/students/${id}/qr`);
  expect(options).toMatchObject({
    headers: { Authorization: 'Bearer private-token' },
    cache: 'no-store',
    credentials: 'omit',
  });
  expect(options).not.toHaveProperty('body');
  expect(options).not.toHaveProperty('method');
});
it('uses the configured production API origin', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
  await getStudentQR(id, user.uid, signal());
  expect(fetchMock.mock.calls[0][0]).toBe(
    `https://api.example.com/api/v1/students/${id}/qr`,
  );
});
it('rejects invalid IDs before authentication or network access', async () => {
  await expect(
    getStudentQR('https://example.com/qr?token=x', user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'not-found' });
  expect(user.getIdToken).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)(
  'handles QR HTTP %s without retry or fallback issuance',
  async (status, kind) => {
    fetchMock.mockResolvedValue(
      new Response('private service error', { status }),
    );
    await expect(getStudentQR(id, user.uid, signal())).rejects.toMatchObject({
      kind,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it('rejects empty, non-PNG and malformed image responses', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('private data'),
    new Response('', { headers: { 'Content-Type': 'image/png' } }),
    new Response('not a png', { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    fetchMock.mockResolvedValue(response);
    await expect(getStudentQR(id, user.uid, signal())).rejects.toMatchObject({
      kind: 'unavailable',
    });
  }
});
it('rejects a different, missing or changed Firebase identity', async () => {
  await expect(
    getStudentQR(id, 'different-uid', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  auth.currentUser = null;
  await expect(getStudentQR(id, user.uid, signal())).rejects.toMatchObject({
    kind: 'session',
  });
  expect(fetchMock).not.toHaveBeenCalled();
  auth.currentUser = user;
  fetchMock.mockImplementation(async () => {
    auth.currentUser = null;
    return png();
  });
  await expect(getStudentQR(id, user.uid, signal())).rejects.toMatchObject({
    kind: 'session',
  });
});
it('does not return an image when aborted while reading the response', async () => {
  const controller = new AbortController();
  const response = png();
  const bytes = await response.arrayBuffer();
  vi.spyOn(response, 'arrayBuffer').mockImplementation(async () => {
    controller.abort();
    return bytes;
  });
  fetchMock.mockResolvedValue(response);
  await expect(
    getStudentQR(id, user.uid, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
