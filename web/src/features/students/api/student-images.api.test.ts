import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import {
  getStudentImage,
  uploadStudentImage,
  removeStudentImage,
} from './student-images.api';
import { studentFixture } from '../../../test/fixtures/student';

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
it('fetches private image bytes using authorization, no-store and the canonical endpoint', async () => {
  fetchMock.mockResolvedValue(
    new Response('image-bytes', { headers: { 'Content-Type': 'image/png' } }),
  );
  expect((await getStudentImage(id, 'staff', signal()))?.type).toBe(
    'image/png',
  );
  expect(fetchMock).toHaveBeenCalledWith(
    `/backend-api/api/v1/students/${id}/image`,
    expect.objectContaining({
      headers: { Authorization: 'Bearer private-token' },
      cache: 'no-store',
      credentials: 'omit',
    }),
  );
});
it('uploads a raw file with matching content type, not JSON or multipart', async () => {
  const file = new File(['png'], 'photo.png', { type: 'image/png' });
  const profile = {
    ...studentFixture,
    profile_image_url: `/api/v1/students/${id}/image`,
  };
  fetchMock.mockResolvedValue(new Response(JSON.stringify(profile)));
  await expect(
    uploadStudentImage(id, file, 'staff', signal()),
  ).resolves.toEqual(profile);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    method: 'PUT',
    body: file,
    headers: {
      Authorization: 'Bearer private-token',
      'Content-Type': 'image/png',
    },
  });
});
it('removes with an empty DELETE and requires a 204 acknowledgement', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await removeStudentImage(id, 'staff', signal());
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    method: 'DELETE',
    headers: { Authorization: 'Bearer private-token' },
  });
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  fetchMock.mockResolvedValue(new Response('{}'));
  await expect(removeStudentImage(id, 'staff', signal())).rejects.toMatchObject(
    { kind: 'unavailable' },
  );
});
it('treats a missing image as absent and rejects invalid content or empty bodies', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
  await expect(getStudentImage(id, 'staff', signal())).resolves.toBeNull();
  for (const response of [
    new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    new Response('', { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    fetchMock.mockResolvedValue(response);
    await expect(getStudentImage(id, 'staff', signal())).rejects.toMatchObject({
      kind: 'unavailable',
    });
  }
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [413, 'invalid'],
  [415, 'invalid'],
  [503, 'unavailable'],
] as const)(
  'handles HTTP %s without retrying a write',
  async (status, kind) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(
      uploadStudentImage(
        id,
        new File(['x'], 'x.png', { type: 'image/png' }),
        'staff',
        signal(),
      ),
    ).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it('rejects malformed and mismatched upload responses', async () => {
  for (const body of [
    {},
    studentFixture,
    {
      ...studentFixture,
      student_id: studentFixture.user_id,
      profile_image_url: '/photo',
    },
  ]) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(
      uploadStudentImage(id, new File(['x'], 'x.png'), 'staff', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('blocks invalid IDs, changed sessions and signed-out requests', async () => {
  await expect(
    getStudentImage('https://evil.example', 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'not-found' });
  await expect(
    getStudentImage(id, 'other-staff', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockImplementation(async () => {
    auth.currentUser = null;
    return new Response('png', { headers: { 'Content-Type': 'image/png' } });
  });
  await expect(getStudentImage(id, 'staff', signal())).rejects.toMatchObject({
    kind: 'session',
  });
});
