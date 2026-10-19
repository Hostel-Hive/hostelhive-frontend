import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import {
  registerStudentInvitation,
  getStudentInvitation,
  validInvitation,
} from './student-invitations.api';
import { invitationFixture as invitation } from '../../../test/fixtures/student-invitation';
import { studentFixture } from '../../../test/fixtures/student';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff-uid', getIdToken: vi.fn() };
const auth = {
  authStateReady: vi.fn(),
  currentUser: user as typeof user | null,
};
const fetchMock = vi.fn();
const input = {
  request_id: invitation.request_id,
  email: invitation.email,
  index_no: studentFixture.index_no,
  full_name: studentFixture.full_name,
  faculty: studentFixture.faculty,
  year: 2,
  contact_phone: studentFixture.contact_phone,
  guardians: [
    { name: 'Robin', relationship: 'Parent', contact_phone: '+94771111111' },
  ],
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
  auth.currentUser = user;
  auth.authStateReady.mockResolvedValue(undefined);
  user.getIdToken.mockResolvedValue('test-token');
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ invitation, replayed: false }), {
      status: 201,
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('student invitation API', () => {
  it('uses the authorized invitation endpoint and accepts an exact replay', async () => {
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).resolves.toEqual({ invitation, replayed: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/backend-api/api/v1/student-invitations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ invitation, replayed: true }), {
        status: 200,
      }),
    );
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).resolves.toMatchObject({ replayed: true });
  });
  it('retrieves status without a body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(invitation)));
    await expect(
      getStudentInvitation(invitation.invitation_id, user.uid, signal()),
    ).resolves.toEqual(invitation);
    expect(fetchMock.mock.calls[0][0]).toContain(
      '/student-invitations/' + invitation.invitation_id,
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it.each([
    [400, 'invalid'],
    [401, 'session'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'duplicate'],
    [413, 'invalid'],
    [415, 'invalid'],
    [503, 'unavailable'],
  ] as const)(
    'handles HTTP %s without automatic write retries',
    async (status, kind) => {
      fetchMock.mockResolvedValue(
        new Response('private provider error', { status }),
      );
      await expect(
        registerStudentInvitation(input, user.uid, signal()),
      ).rejects.toMatchObject({ kind });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    {},
    { invitation, replayed: 'false' },
    {
      invitation: { ...invitation, request_id: studentFixture.user_id },
      replayed: false,
    },
    {
      invitation: { ...invitation, email: 'other@example.edu' },
      replayed: false,
    },
    { invitation, replayed: true },
  ])('rejects malformed or mismatched success', async (data) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(data), { status: 201 }),
    );
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('handles non-JSON success and network failure as uncertain', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON', { status: 201 }));
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    fetchMock.mockRejectedValue(new TypeError('network'));
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('validates references before requesting credentials', async () => {
    await expect(
      registerStudentInvitation(
        { ...input, request_id: 'invalid' },
        user.uid,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
    await expect(
      getStudentInvitation('invalid', user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects missing sessions without fetching', async () => {
    auth.currentUser = null;
    await expect(
      registerStudentInvitation(input, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects mismatched and non-JSON status responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...invitation,
          invitation_id: studentFixture.user_id,
        }),
      ),
    );
    await expect(
      getStudentInvitation(invitation.invitation_id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    fetchMock.mockResolvedValue(new Response('broken'));
    await expect(
      getStudentInvitation(invitation.invitation_id, user.uid, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each([
    null,
    {},
    { ...invitation, attempts: -1 },
    { ...invitation, attempts: 9 },
    { ...invitation, delivery_status: 'delivered' },
    { ...invitation, next_attempt_at: 'invalid' },
    { ...invitation, last_error: 'private secret' },
    { ...invitation, student_id: '00000000-0000-0000-0000-000000000000' },
  ])('rejects invalid metadata', (value) => {
    expect(validInvitation(value)).toBe(false);
  });
});
