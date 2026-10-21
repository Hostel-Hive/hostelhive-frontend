import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  provisionStaff,
  validateAccount,
  readStaffRecovery,
  writeStaffRecovery,
  clearStaffRecovery,
  type StaffAccountInput,
  type StaffRecovery,
} from './staff-provisioning.api';
import { staffProfile } from '../../../test/fixtures/staffProfiles';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const account = {
  user_id: staffProfile.user_id,
  firebase_uid: 'new-staff',
  email: 'warden@example.edu',
  role: 'warden' as const,
  is_active: true,
};
const input: StaffAccountInput = {
  email: ' Warden@Example.edu ',
  role: 'warden',
  password: 'initial-password-20',
};
const recovery: StaffRecovery = {
  key: 'original-key-83',
  email: account.email,
  role: 'warden',
  full_name: staffProfile.full_name,
  designation: staffProfile.designation,
};
const signal = new AbortController().signal;
const response = (value: unknown, status = 201) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  request.mockResolvedValue(response({ account, replayed: false }));
});
afterEach(() => vi.restoreAllMocks());
it('posts only normalized account fields and a stable idempotency header', async () => {
  expect(await provisionStaff(input, recovery.key, 'admin', signal)).toEqual({
    account,
    replayed: false,
  });
  expect(request).toHaveBeenCalledWith('/api/v1/users', 'admin', signal, {
    method: 'POST',
    contentType: 'application/json',
    idempotencyKey: recovery.key,
    body: JSON.stringify({ ...input, email: account.email }),
  });
});
it('accepts a replay without claiming the original role or active status was restored', async () => {
  request.mockResolvedValue(
    response(
      {
        account: { ...account, role: 'student', is_active: false },
        replayed: true,
      },
      200,
    ),
  );
  expect(
    (await provisionStaff(input, recovery.key, 'admin', signal)).account,
  ).toMatchObject({ role: 'student', is_active: false });
});
it.each(['admin', 'warden', 'sub_warden', 'security_staff'] as const)(
  'supports staff role %s',
  (role) => expect(validateAccount({ ...input, role })).toEqual({}),
);
it.each([
  { ...input, email: '' },
  { ...input, email: 'invalid' },
  { ...input, email: 'a b@domain.test' },
  { ...input, email: 'a@b@c' },
  { ...input, email: 'x'.repeat(250) + '@a.test' },
  { ...input, role: 'student' },
  { ...input, password: 'too-short' },
  { ...input, password: 'x'.repeat(129) },
  { ...input, password: '\ud800'.repeat(20) },
])('rejects invalid account input before mutation %j', async (value) => {
  expect(
    Object.keys(validateAccount(value as StaffAccountInput)).length,
  ).toBeGreaterThan(0);
  await expect(
    provisionStaff(value as StaffAccountInput, recovery.key, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('counts Unicode password characters and does not trim passwords', async () => {
  expect(validateAccount({ ...input, password: '😀'.repeat(128) })).toEqual({});
  const password = '  original-password  ';
  await provisionStaff({ ...input, password }, recovery.key, 'admin', signal);
  expect(JSON.parse(String(request.mock.calls[0][3]?.body)).password).toBe(
    password,
  );
});
it.each(['short', 'bad key with spaces', 'x'.repeat(129)])(
  'rejects invalid operation key %s',
  async (key) => {
    await expect(
      provisionStaff(input, key, 'admin', signal),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [409, 'conflict'],
  [503, 'unavailable'],
  [500, 'unavailable'],
  [202, 'unavailable'],
])('maps HTTP %s without exposing raw errors', async (status, kind) => {
  request.mockResolvedValue(
    response({ error: 'private-provider-details' }, Number(status)),
  );
  await expect(
    provisionStaff(input, recovery.key, 'admin', signal),
  ).rejects.toMatchObject({ kind });
});
it.each([
  new Error('network'),
  new AuthorizedRequestError('session', 'expired'),
  new AuthorizedRequestError('unavailable', 'offline'),
])('maps transport failures', async (error) => {
  request.mockRejectedValue(error);
  await expect(
    provisionStaff(input, recovery.key, 'admin', signal),
  ).rejects.toMatchObject({
    kind:
      error instanceof AuthorizedRequestError && error.kind === 'session'
        ? 'session'
        : 'unavailable',
  });
});
it.each([
  null,
  {},
  { account, replayed: true },
  { account, replayed: 'false' },
  { account: {}, replayed: false },
  { account: { ...account, email: 'other@example.edu' }, replayed: false },
  { account: { ...account, role: 'admin' }, replayed: false },
  { account: { ...account, is_active: false }, replayed: false },
])('rejects unconfirmed responses %j', async (value) => {
  request.mockResolvedValue(response(value));
  await expect(
    provisionStaff(input, recovery.key, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects malformed JSON', async () => {
  request.mockResolvedValue(new Response('invalid', { status: 201 }));
  await expect(
    provisionStaff(input, recovery.key, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('stores scoped recovery data without passwords or arbitrary credential fields', () => {
  writeStaffRecovery('admin', {
    ...recovery,
    account,
    password: input.password,
  } as StaffRecovery);
  expect(sessionStorage.getItem('hostelhive:staff-setup:admin')).not.toContain(
    input.password,
  );
  expect(readStaffRecovery('admin')).toEqual({ ...recovery, account });
  expect(readStaffRecovery('another-admin')).toBeNull();
  clearStaffRecovery('admin');
  expect(readStaffRecovery('admin')).toBeNull();
});
it('restores an account request that has no confirmed account yet', () => {
  writeStaffRecovery('admin', recovery);
  expect(readStaffRecovery('admin')).toEqual(recovery);
});
it.each([
  'bad-json',
  'null',
  '{}',
  JSON.stringify({ ...recovery, key: 'bad' }),
  JSON.stringify({ ...recovery, role: 'student' }),
  JSON.stringify({ ...recovery, email: 'bad' }),
  JSON.stringify({ ...recovery, designation: '' }),
  JSON.stringify({
    ...recovery,
    account: { ...account, email: 'other@example.edu' },
  }),
])('rejects unsafe recovery records %s', (raw) => {
  sessionStorage.setItem('hostelhive:staff-setup:admin', raw);
  expect(() => readStaffRecovery('admin')).toThrow('could not be read safely');
});
it('fails safely when storage is unavailable and tolerates failed cleanup', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => writeStaffRecovery('admin', recovery)).toThrow(
    'No new account request was started',
  );
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => readStaffRecovery('admin')).toThrow('could not be read safely');
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => clearStaffRecovery('admin')).not.toThrow();
});
