import { beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import {
  uploadOwnPhoto,
  removeOwnPhoto,
  OwnPhotoInputError,
} from './own-photo.api';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const id = '11111111-1111-4111-8111-111111111111';
const path = '/api/v1/me/student-profile/image';
const signal = () => new AbortController().signal;
const photo = () => new File(['bytes'], 'photo.png', { type: 'image/png' });
beforeEach(() => vi.resetAllMocks());
it('sends raw authenticated image bytes to the fixed own endpoint', async () => {
  request.mockResolvedValue(
    Response.json({ student_id: id, profile_image_url: path }),
  );
  const file = photo();
  const abort = signal();
  await uploadOwnPhoto(file, id, 'student', abort);
  expect(request).toHaveBeenCalledWith(path, 'student', abort, {
    method: 'PUT',
    body: file,
    contentType: 'image/png',
  });
});
it('removes with an empty DELETE and accepts an empty 204 response', async () => {
  request.mockResolvedValue(new Response(null, { status: 204 }));
  const abort = signal();
  await removeOwnPhoto('student', abort);
  expect(request).toHaveBeenCalledWith(path, 'student', abort, {
    method: 'DELETE',
  });
});
it.each([
  new File(['x'], 'x.svg', { type: 'image/svg+xml' }),
  new File([], 'empty.png', { type: 'image/png' }),
  new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
    type: 'image/png',
  }),
])('rejects invalid uploads before transport', async (file) => {
  await expect(
    uploadOwnPhoto(file, id, 'student', signal()),
  ).rejects.toBeInstanceOf(OwnPhotoInputError);
  expect(request).not.toHaveBeenCalled();
});
it.each([400, 413, 415])(
  'keeps rejected upload %s distinct from uncertain writes',
  async (status) => {
    request.mockResolvedValue(Response.json({}, { status }));
    await expect(
      uploadOwnPhoto(photo(), id, 'student', signal()),
    ).rejects.toBeInstanceOf(OwnPhotoInputError);
  },
);
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
])('handles %s without retrying', async (status, kind) => {
  request.mockResolvedValue(
    Response.json({ error: 'denied' }, { status: status as number }),
  );
  await expect(removeOwnPhoto('student', signal())).rejects.toMatchObject({
    kind,
  });
  expect(request).toHaveBeenCalledOnce();
});
it('handles setup-required and an unconfirmed network response', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ error: 'setup_required' }, { status: 403 }),
    )
    .mockRejectedValueOnce(new Error('Offline'));
  await expect(removeOwnPhoto('student', signal())).rejects.toMatchObject({
    kind: 'setup',
  });
  await expect(removeOwnPhoto('student', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([
  {
    student_id: '99999999-9999-4999-8999-999999999999',
    profile_image_url: path,
  },
  { student_id: id, profile_image_url: 'https://public.invalid/photo.png' },
  {},
])('rejects unowned or unsafe upload acknowledgements', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(
    uploadOwnPhoto(photo(), id, 'student', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects unexpected success statuses and aborted responses', async () => {
  request.mockResolvedValueOnce(Response.json({}));
  await expect(removeOwnPhoto('student', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    removeOwnPhoto('student', controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
