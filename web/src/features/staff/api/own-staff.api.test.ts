import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  getOwnStaffProfile,
  staffNameError,
  updateOwnStaffName,
} from './own-staff.api';
import {
  ownStaffAccount as account,
  ownStaffProfile as profile,
} from '../../../test/fixtures/ownStaff';
import { staffProfile } from '../../../test/fixtures/staffProfiles';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('reads the authenticated account projection rather than Admin staff-management endpoints', async () => {
  request.mockResolvedValue(Response.json(account));
  expect(await getOwnStaffProfile(account, signal())).toEqual(profile);
  expect(request).toHaveBeenCalledWith(
    '/api/v1/me',
    account.firebase_uid,
    expect.any(AbortSignal),
    undefined,
  );
});
it('allows missing profile fields so a staff member can add their name', async () => {
  const { full_name, designation, ...base } = account;
  void full_name;
  void designation;
  request.mockResolvedValue(Response.json(base));
  expect(await getOwnStaffProfile(account, signal())).toMatchObject({
    full_name: '',
    designation: '',
  });
});
it('writes only a trimmed full_name and accepts concurrently updated designation', async () => {
  request.mockResolvedValue(
    Response.json({
      ...staffProfile,
      full_name: 'Updated Name',
      designation: 'New designation',
    }),
  );
  expect(
    await updateOwnStaffName(account, ' Updated Name ', signal()),
  ).toMatchObject({
    full_name: 'Updated Name',
    designation: 'New designation',
  });
  expect(request).toHaveBeenCalledWith(
    '/api/v1/staff/me',
    account.firebase_uid,
    expect.any(AbortSignal),
    {
      method: 'PUT',
      contentType: 'application/json',
      body: JSON.stringify({ full_name: 'Updated Name' }),
    },
  );
});
it('allows self creation with an unassigned designation', async () => {
  request.mockResolvedValue(
    Response.json({
      ...staffProfile,
      full_name: 'First Name',
      designation: '',
    }),
  );
  expect(
    await updateOwnStaffName(account, 'First Name', signal()),
  ).toMatchObject({ designation: '' });
});
it.each(['', '  ', 'a'.repeat(201), 'name\nname', '\ud800'])(
  'rejects invalid names before writes',
  async (name) => {
    expect(staffNameError(name)).toBeTruthy();
    await expect(
      updateOwnStaffName(account, name, signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it('counts Unicode characters rather than UTF-16 code units', () => {
  expect(staffNameError('名'.repeat(200))).toBeUndefined();
  expect(staffNameError('😀'.repeat(200))).toBeUndefined();
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [400, 'invalid'],
  [409, 'conflict'],
  [503, 'unavailable'],
])('handles HTTP %s safely', async (status, kind) => {
  request.mockResolvedValue(new Response(null, { status: Number(status) }));
  await expect(
    updateOwnStaffName(account, 'Name', signal()),
  ).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it('preserves transport session errors and does not retry network failures', async () => {
  request
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockRejectedValueOnce(new TypeError('Network'));
  await expect(getOwnStaffProfile(account, signal())).rejects.toMatchObject({
    kind: 'session',
  });
  await expect(
    updateOwnStaffName(account, 'Name', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  { ...account, user_id: 'another' },
  { ...account, firebase_uid: 'another' },
  { ...account, role: 'student' },
  { ...account, is_active: false },
])('rejects mismatched own-account responses', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(getOwnStaffProfile(account, signal())).rejects.toMatchObject({
    kind: 'forbidden',
  });
});
it.each([
  null,
  { ...account, full_name: 123 },
  { ...account, designation: null },
])('rejects malformed projection data', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(getOwnStaffProfile(account, signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([
  {
    ...staffProfile,
    user_id: '80000000-0000-4000-8000-000000000001',
    full_name: 'Name',
  },
  { ...staffProfile, full_name: 'Another name' },
  { ...staffProfile, full_name: 'Name', is_active: false },
])('rejects unverified save acknowledgements', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(
    updateOwnStaffName(account, 'Name', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('requires revalidation after role changes and rejects invalid JSON', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ ...staffProfile, full_name: 'Name', role: 'admin' }),
    )
    .mockResolvedValueOnce(new Response('bad'));
  await expect(
    updateOwnStaffName(account, 'Name', signal()),
  ).rejects.toMatchObject({ kind: 'forbidden' });
  await expect(getOwnStaffProfile(account, signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
