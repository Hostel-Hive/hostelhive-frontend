import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  evidenceAccessError,
  evidenceError,
  getComplaintImage,
  listComplaintImages,
  removeComplaintImage,
  uploadComplaintImage,
} from './complaint-images.api';
import {
  evidenceFixture as image,
  pngBytes,
} from '../../../test/fixtures/complaintImages';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const list = { items: [image], version: 2 };
const file = () => new File([pngBytes], 'evidence.png', { type: 'image/png' });
beforeEach(() => vi.resetAllMocks());
it('lists evidence from derived authenticated paths without selectors or public URLs', async () => {
  request.mockResolvedValue(Response.json(list));
  expect(
    await listComplaintImages(
      image.complaint_id.toUpperCase(),
      'student',
      signal(),
    ),
  ).toEqual(list);
  expect(request.mock.calls[0]).toEqual([
    `/api/v1/complaints/${image.complaint_id}/images`,
    'student',
    expect.any(AbortSignal),
  ]);
});
it.each([
  { items: [image, image], version: 2 },
  { items: [{ ...image, complaint_id: image.image_id }], version: 2 },
  { items: [{ ...image, content_type: 'image/svg+xml' }], version: 2 },
  { items: [{ ...image, width: 4097 }], version: 2 },
  { items: [{ ...image, width: 4000, height: 4000 }], version: 2 },
  { items: [{ ...image, size_bytes: 5242881 }], version: 2 },
  { items: [{ ...image, uploaded_at: null }], version: 2 },
  { items: [], version: 0 },
  { items: [image, image, image, image], version: 2 },
])(
  'rejects malformed, cross-complaint or oversized metadata %#',
  async (body) => {
    request.mockResolvedValue(Response.json(body));
    await expect(
      listComplaintImages(image.complaint_id, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('fetches private image bytes using metadata IDs, never a supplied URL', async () => {
  request.mockResolvedValue(
    new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } }),
  );
  const blob = await getComplaintImage(
    { ...image, url: 'https://untrusted.example' } as typeof image,
    'uid',
    signal(),
  );
  expect(blob.size).toBe(8);
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/complaints/${image.complaint_id}/images/${image.image_id}`,
  );
});
it.each([
  ['image/svg+xml', pngBytes],
  ['image/png', new Uint8Array(8)],
  ['image/png', new Uint8Array(10)],
])('rejects incorrect image content/type/size %#', async (type, bytes) => {
  request.mockResolvedValue(
    new Response(bytes, { headers: { 'Content-Type': type as string } }),
  );
  await expect(getComplaintImage(image, 'uid', signal())).rejects.toMatchObject(
    { kind: 'unavailable' },
  );
});
it('accepts JPEG signature bytes', async () => {
  request.mockResolvedValue(
    new Response(new Uint8Array([255, 216, 255]), {
      headers: { 'Content-Type': 'image/jpeg' },
    }),
  );
  expect(
    (
      await getComplaintImage(
        { ...image, content_type: 'image/jpeg', size_bytes: 3 },
        'uid',
        signal(),
      )
    ).size,
  ).toBe(3);
});
it('uploads raw bytes and preserves the file and image ID on replay', async () => {
  const selected = file();
  request
    .mockResolvedValueOnce(
      Response.json({ image, version: 2, replayed: false }, { status: 201 }),
    )
    .mockResolvedValueOnce(
      Response.json({ image, version: 2, replayed: true }),
    );
  for (let i = 0; i < 2; i++)
    await uploadComplaintImage(
      image.complaint_id,
      image.image_id,
      selected,
      'uid',
      signal(),
    );
  expect(request.mock.calls[0][3]).toEqual({
    method: 'PUT',
    contentType: 'image/png',
    body: selected,
  });
  expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
});
it.each([
  {
    image: { ...image, image_id: image.complaint_id },
    version: 2,
    replayed: false,
  },
  { image, version: 1, replayed: false },
  { image, version: 2, replayed: true },
])(
  'rejects unrelated or inconsistent upload acknowledgements %#',
  async (body) => {
    request.mockResolvedValue(Response.json(body, { status: 201 }));
    await expect(
      uploadComplaintImage(
        image.complaint_id,
        image.image_id,
        file(),
        'uid',
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('removes with an empty DELETE and parses the JSON audit/replay result', async () => {
  const body = {
    image_id: image.image_id,
    removed: true,
    version: 3,
    replayed: true,
  };
  request.mockResolvedValue(Response.json(body));
  expect(
    await removeComplaintImage(
      image.complaint_id,
      image.image_id,
      'uid',
      signal(),
    ),
  ).toEqual(body);
  expect(request.mock.calls[0][3]).toEqual({ method: 'DELETE' });
});
it.each([
  { image_id: image.complaint_id, removed: true, version: 3, replayed: false },
  { image_id: image.image_id, removed: false, version: 3, replayed: false },
  { image_id: image.image_id, removed: true, version: 0, replayed: false },
])('rejects malformed removal acknowledgements %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    removeComplaintImage(image.complaint_id, image.image_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects invalid IDs and unsupported files before sending', async () => {
  await expect(
    listComplaintImages('invalid', 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    removeComplaintImage(image.complaint_id, 'invalid', 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  for (const selected of [
    new File(['svg'], 'x.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(5242881)], 'large.png', { type: 'image/png' }),
  ])
    await expect(
      uploadComplaintImage(
        image.complaint_id,
        image.image_id,
        selected,
        'uid',
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [400, 'invalid_input', 'invalid'],
  [401, 'unauthorized', 'session'],
  [403, 'forbidden', 'forbidden'],
  [403, 'setup_required', 'setup'],
  [404, 'not_found', 'not-found'],
  [409, 'complaint_conflict', 'conflict'],
  [413, 'payload_too_large', 'invalid'],
  [415, 'unsupported_media_type', 'invalid'],
  [503, 'complaint_images_unavailable', 'unavailable'],
] as const)('maps HTTP %s %s safely', async (status, error, kind) => {
  request.mockResolvedValue(Response.json({ error }, { status }));
  await expect(
    listComplaintImages(image.complaint_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles missing JSON, network loss, session failures and cancelled results', async () => {
  request
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockRejectedValueOnce(new Error('network'));
  for (let i = 0; i < 2; i++)
    await expect(
      removeComplaintImage(image.complaint_id, image.image_id, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  request.mockRejectedValueOnce(
    new AuthorizedRequestError('session', 'expired'),
  );
  await expect(
    listComplaintImages(image.complaint_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  const cancelled = new AbortController();
  cancelled.abort();
  request.mockResolvedValue(Response.json(list));
  await expect(
    listComplaintImages(image.complaint_id, 'uid', cancelled.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  expect(
    evidenceAccessError(
      evidenceError(new AuthorizedRequestError('session', 'expired')),
    ),
  ).toBe(true);
  expect(evidenceAccessError(evidenceError(null))).toBe(false);
});
