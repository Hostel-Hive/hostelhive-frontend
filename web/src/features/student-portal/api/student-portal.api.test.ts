import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  getOwnProfile,
  getOwnPhoto,
  getOwnQR,
  validOwnProfile,
  portalError,
} from './student-portal.api';
import { ownStudentProfile as profile } from '../../../test/fixtures/ownStudentProfile';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
it('reads only the authenticated own profile without a target ID, body or filters', async () => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(JSON.stringify(profile)),
  );
  const abort = signal();
  expect(await getOwnProfile('uid', abort)).toEqual(profile);
  expect(authorizedRequest).toHaveBeenCalledWith(
    '/api/v1/me/student-profile',
    'uid',
    abort,
  );
});
it('accepts null accommodation/photo, no guardians and unknown presence', () => {
  expect(
    validOwnProfile({
      ...profile,
      accommodation: null,
      guardians: [],
      presence: { status: 'UNKNOWN', updated_at: null },
    }),
  ).toBe(true);
});
it.each([
  null,
  {},
  { ...profile, student_id: 'bad' },
  { ...profile, year: '2' },
  { ...profile, guardians: [{}] },
  { ...profile, profile_image_url: 'https://untrusted.example/photo.png' },
  { ...profile, accommodation: {} },
  {
    ...profile,
    accommodation: { ...profile.accommodation, started_at: 'bad' },
  },
  { ...profile, presence: { status: 'IN', updated_at: null } },
  {
    ...profile,
    presence: { status: 'UNKNOWN', updated_at: profile.presence.updated_at },
  },
  { ...profile, presence: { status: 'OUT', updated_at: 'bad' } },
])('rejects malformed profile data %#', async (body) => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(JSON.stringify(body)),
  );
  await expect(getOwnProfile('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)('handles profile status %s', async (status, kind) => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response('{}', { status }),
  );
  await expect(getOwnProfile('uid', signal())).rejects.toMatchObject({ kind });
});
it('distinguishes required setup and maps expired credentials without exposing service internals', async () => {
  vi.mocked(authorizedRequest)
    .mockResolvedValueOnce(
      new Response('{"error":"setup_required"}', { status: 403 }),
    )
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockRejectedValueOnce(new Error('private database error'));
  await expect(getOwnProfile('uid', signal())).rejects.toMatchObject({
    kind: 'setup',
  });
  await expect(getOwnProfile('uid', signal())).rejects.toMatchObject({
    kind: 'session',
  });
  await expect(getOwnProfile('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
    message: 'Unable to load student information. Please try again.',
  });
  expect(portalError(new Error('secret')).message).not.toContain('secret');
});
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
it.each([
  ['qr', getOwnQR, '/api/v1/me/qr'],
  ['photo', getOwnPhoto, '/api/v1/me/student-profile/image'],
] as const)(
  'loads authenticated %s bytes with no client-selected student',
  async (_label, load, path) => {
    vi.mocked(authorizedRequest).mockResolvedValue(
      new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    );
    const abort = signal();
    const blob = await load('uid', abort);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(9);
    expect(authorizedRequest).toHaveBeenCalledWith(path, 'uid', abort);
  },
);
it('supports a normalized JPEG photo', async () => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(new Uint8Array([255, 216, 255, 1]), {
      headers: { 'Content-Type': 'image/jpeg' },
    }),
  );
  expect((await getOwnPhoto('uid', signal())).type).toBe('image/jpeg');
});
it.each([
  { headers: { 'Content-Type': 'text/html' }, body: '<html>' },
  { headers: { 'Content-Type': 'image/png' }, body: 'bad bytes' },
  {
    headers: { 'Content-Type': 'image/png', 'Content-Length': '6000000' },
    body: png,
  },
  {
    headers: { 'Content-Type': 'image/jpeg' },
    body: new Uint8Array([255, 216, 255, 1]),
  },
])(
  'rejects invalid or oversized QR responses %#',
  async ({ headers, body }) => {
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) responseHeaders.set(key, value);
    }
    vi.mocked(authorizedRequest).mockResolvedValue(
      new Response(body, { headers: responseHeaders }),
    );
    await expect(getOwnQR('uid', signal())).rejects.toMatchObject({
      kind: 'unavailable',
    });
  },
);
it('ignores aborted profile/image responses', async () => {
  const abort = new AbortController();
  abort.abort();
  vi.mocked(authorizedRequest)
    .mockResolvedValueOnce(new Response(JSON.stringify(profile)))
    .mockResolvedValueOnce(
      new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    );
  await expect(getOwnProfile('uid', abort.signal)).rejects.toMatchObject({
    kind: 'unavailable',
  });
  await expect(getOwnQR('uid', abort.signal)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
