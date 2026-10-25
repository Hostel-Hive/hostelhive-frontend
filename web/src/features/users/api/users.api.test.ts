import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  changeUser,
  listUsers,
  userOffset,
  validUser,
  type AccountAction,
} from './users.api';
import {
  managedUser as user,
  managedUserPage as page,
} from '../../../test/fixtures/managedUsers';
vi.mock('../../auth/api/authorized-request', () => ({
  authorizedRequest: vi.fn(),
  AuthorizedRequestError: class extends Error {
    constructor(
      public kind: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
const request = vi.mocked(authorizedRequest);

it('validates optional student lifecycle metadata without inventing missing status', () => {
  expect(validUser(user)).toBe(true);
  const enriched = {
    ...user,
    student_profile_id: '11111111-1111-4111-8111-111111111111',
    student_profile_archived: true,
    student_has_active_bed: false,
  };
  expect(validUser(enriched)).toBe(true);
  expect(validUser({ ...enriched, student_profile_archived: 'yes' })).toBe(
    false,
  );
  expect(validUser({ ...user, student_has_active_bed: false })).toBe(false);
  expect(validUser({ ...enriched, role: 'warden' })).toBe(false);
});
const signal = new AbortController().signal;
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.resetAllMocks();
  request.mockResolvedValue(response(page()));
});
it('reads only supported pagination with the authenticated request helper', async () => {
  expect(await listUsers('admin', signal, 0)).toEqual(page());
  expect(request).toHaveBeenCalledWith(
    '/api/v1/users?limit=20&offset=0',
    'admin',
    signal,
    undefined,
  );
});
it.each(['', 'offset=20', 'offset=1000000'])(
  'parses valid page %s',
  (query) => {
    expect(userOffset(new URLSearchParams(query))).toBe(
      Number(new URLSearchParams(query).get('offset') ?? 0),
    );
  },
);
it.each([
  'offset=-1',
  'offset=1.5',
  'offset=1000001',
  'q=student',
  'offset=0&offset=20',
  'offset=NaN',
])('rejects unsupported query %s', (query) => {
  expect(userOffset(new URLSearchParams(query))).toBeNull();
});
it.each([-1, 1.5, 1000001, NaN])(
  'rejects invalid offset %s without a request',
  async (offset) => {
    await expect(listUsers('admin', signal, offset)).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  null,
  [],
  {},
  { ...user, role: 'unknown' },
  { ...user, user_id: 'bad' },
  { ...user, firebase_uid: '' },
  { ...user, email: '' },
  { ...user, is_active: 'true' },
  { ...user, full_name: 4 },
  { ...user, designation: null },
])('rejects malformed account %j', (value) =>
  expect(validUser(value)).toBe(false),
);
it.each([
  null,
  {},
  { ...page(), users: null },
  { ...page(), users: [{}] },
  { ...page(), limit: 100 },
  { ...page(), offset: 20 },
  { ...page(), has_more: 'false' },
  { ...page(), has_more: true },
  page([user, user]),
  page([user, { ...user, user_id: 'd0be4fa1-b22d-4ef9-9fca-90afe37c9102' }]),
  page(Array.from({ length: 21 }, () => user)),
])('does not expose malformed pages %j', async (value) => {
  request.mockResolvedValue(response(value));
  await expect(listUsers('admin', signal, 0)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'missing'],
  [400, 'invalid'],
  [500, 'unavailable'],
  [202, 'unavailable'],
])('maps HTTP %s', async (status, kind) => {
  request.mockResolvedValue(response({}, Number(status)));
  await expect(listUsers('admin', signal, 0)).rejects.toMatchObject({ kind });
});
it.each([
  ['last_active_admin', 'last active Admin'],
  ['revocation_pending', 'revocation is still processing'],
  ['provisioning_incomplete', 'provisioning is incomplete'],
  ['firebase_identity_missing', 'identity is missing'],
  ['firebase_identity_mismatch', 'does not match'],
  ['unknown', 'conflicts'],
  ['__proto__', 'conflicts'],
])('explains conflict %s', async (code, message) => {
  request.mockResolvedValue(response({ error: code }, 409));
  await expect(
    changeUser('admin', signal, user, { kind: 'activate' }),
  ).rejects.toThrow(message);
});
it('bounds malformed conflict bodies', async () => {
  request.mockResolvedValue(new Response('not-json', { status: 409 }));
  await expect(listUsers('admin', signal, 0)).rejects.toMatchObject({
    kind: 'conflict',
  });
});
it.each([
  new Error('network'),
  new AuthorizedRequestError('unavailable', 'network'),
  new AuthorizedRequestError('session', 'expired'),
])('maps transport errors', async (error) => {
  request.mockRejectedValue(error);
  await expect(listUsers('admin', signal, 0)).rejects.toMatchObject({
    kind:
      error instanceof AuthorizedRequestError && error.kind === 'session'
        ? 'session'
        : 'unavailable',
  });
});
it('treats malformed JSON as unavailable', async () => {
  request.mockResolvedValue(new Response('not-json'));
  await expect(listUsers('admin', signal, 0)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('uses PATCH and the exact role body', async () => {
  request.mockResolvedValue(response({ ...user, role: 'warden' }));
  expect(
    await changeUser('admin', signal, user, { kind: 'role', role: 'warden' }),
  ).toEqual({ account: { ...user, role: 'warden' }, revocationPending: false });
  expect(request).toHaveBeenCalledWith(
    `/api/v1/users/${user.user_id}/role`,
    'admin',
    signal,
    {
      method: 'PATCH',
      body: '{"role":"warden"}',
      contentType: 'application/json',
    },
  );
});
it('activates with an empty POST body', async () => {
  request.mockResolvedValue(response(user));
  await changeUser(
    'admin',
    signal,
    { ...user, is_active: false },
    { kind: 'activate' },
  );
  expect(request).toHaveBeenCalledWith(
    `/api/v1/users/${user.user_id}/activate`,
    'admin',
    signal,
    { method: 'POST' },
  );
});
it.each([false, true])(
  'preserves confirmed local deactivation and revocation pending=%s',
  async (pending) => {
    request.mockResolvedValue(
      response(
        { account: { ...user, is_active: false }, revocation_pending: pending },
        pending ? 202 : 200,
      ),
    );
    expect(
      (await changeUser('admin', signal, user, { kind: 'deactivate' }))
        .revocationPending,
    ).toBe(pending);
    expect(request.mock.calls[0][3]).toEqual({ method: 'POST' });
  },
);
it.each([
  [{ kind: 'role', role: 'warden' }, user],
  [{ kind: 'activate' }, { ...user, is_active: false }],
  [
    { kind: 'activate' },
    { ...user, user_id: 'd0be4fa1-b22d-4ef9-9fca-90afe37c9102' },
  ],
  [{ kind: 'activate' }, { ...user, firebase_uid: 'other' }],
  [{ kind: 'activate' }, null],
  [{ kind: 'deactivate' }, { account: user, revocation_pending: false }],
  [{ kind: 'deactivate' }, { account: { ...user, is_active: false } }],
])('rejects unconfirmed mutation results %j', async (action, result) => {
  request.mockResolvedValue(response(result));
  await expect(
    changeUser('admin', signal, user, action as AccountAction),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects invalid mutation input before transport', async () => {
  await expect(
    changeUser(
      'admin',
      signal,
      { ...user, user_id: 'bad' },
      { kind: 'activate' },
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    changeUser('admin', signal, user, {
      kind: 'role',
      role: 'invalid',
    } as unknown as AccountAction),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
