import { beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import {
  patchOwnProfile,
  OwnProfileInputError,
  type OwnProfilePatch,
} from './own-profile-edit.api';
import { ownStudentProfile as profile } from '../../../test/fixtures/ownStudentProfile';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('sends only changed phone and strips staff-managed fields', async () => {
  request.mockResolvedValue(Response.json(profile));
  await patchOwnProfile(
    {
      contact_phone: ' 0771234567 ',
      faculty: 'Other',
      year: 8,
      student_id: profile.student_id,
    } as OwnProfilePatch,
    profile.student_id,
    'uid',
    signal(),
  );
  expect(request).toHaveBeenCalledWith(
    '/api/v1/me/student-profile',
    'uid',
    expect.any(AbortSignal),
    {
      method: 'PATCH',
      contentType: 'application/json',
      body: JSON.stringify({ contact_phone: '0771234567' }),
    },
  );
});
it('replaces guardians without sending their IDs or unedited phone', async () => {
  request.mockResolvedValue(Response.json(profile));
  await patchOwnProfile(
    { guardians: profile.guardians },
    profile.student_id,
    'uid',
    signal(),
  );
  expect(JSON.parse(request.mock.calls[0][3]!.body as string)).toEqual({
    guardians: profile.guardians.map(
      ({ name, relationship, contact_phone }) => ({
        name,
        relationship,
        contact_phone,
      }),
    ),
  });
});
it.each([{}, { contact_phone: 'x'.repeat(17 * 1024) }])(
  'rejects empty or oversized updates without a write',
  async (input) => {
    await expect(
      patchOwnProfile(input, profile.student_id, 'uid', signal()),
    ).rejects.toBeInstanceOf(OwnProfileInputError);
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  [400, 'input'],
  [413, 'input'],
  [415, 'input'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
])('handles response %s without retrying', async (status, kind) => {
  request.mockResolvedValue(
    Response.json({ error: 'forbidden' }, { status: status as number }),
  );
  const operation = patchOwnProfile(
    { contact_phone: profile.contact_phone },
    profile.student_id,
    'uid',
    signal(),
  );
  if (kind === 'input')
    await expect(operation).rejects.toBeInstanceOf(OwnProfileInputError);
  else await expect(operation).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it('handles setup-required and rejects a response for another student', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ error: 'setup_required' }, { status: 403 }),
    )
    .mockResolvedValueOnce(
      Response.json({
        ...profile,
        student_id: '99999999-9999-4999-8999-999999999999',
      }),
    );
  await expect(
    patchOwnProfile(
      { contact_phone: profile.contact_phone },
      profile.student_id,
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'setup' });
  await expect(
    patchOwnProfile(
      { contact_phone: profile.contact_phone },
      profile.student_id,
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
