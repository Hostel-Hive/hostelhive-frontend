import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  InvitationError,
  listStudentInvitations,
  readStudentInvitation,
  resendStudentInvitation,
  resendWaitSeconds,
} from './invitation-management.api';
import { invitationFixture as row } from '../../../test/fixtures/student-invitation';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const page = { items: [row], total: 1, limit: 20, offset: 0, has_more: false };
const operation = 'abcdef12-1234-4234-8234-123456789abc';
beforeEach(() => vi.resetAllMocks());
it('lists invitation metadata with bounded pagination', async () => {
  request.mockResolvedValue(Response.json(page));
  expect(await listStudentInvitations('admin', 0, signal())).toEqual(page);
  expect(request).toHaveBeenCalledWith(
    '/api/v1/student-invitations?limit=20&offset=0',
    'admin',
    expect.any(AbortSignal),
    undefined,
  );
});
it('reads current invitation details and queues a resend with only its operation UUID', async () => {
  request.mockImplementation(async () => Response.json(row));
  expect(
    await readStudentInvitation(row.invitation_id, 'admin', signal()),
  ).toEqual(row);
  expect(
    await resendStudentInvitation(
      row.invitation_id,
      operation,
      'admin',
      signal(),
    ),
  ).toEqual(row);
  expect(request.mock.calls[1][0]).toBe(
    '/api/v1/student-invitations/' + row.invitation_id + '/resend',
  );
  expect(request.mock.calls[1][3]).toEqual({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ request_id: operation }),
  });
});
it('supports replay when the backend returns completed setup metadata', async () => {
  request.mockResolvedValue(
    Response.json({
      ...row,
      setup_completed_at: row.created_at,
      delivery_status: 'skipped',
    }),
  );
  expect(
    await resendStudentInvitation(
      row.invitation_id,
      operation,
      'admin',
      signal(),
    ),
  ).toMatchObject({ setup_completed_at: row.created_at });
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'missing'],
  [409, 'conflict'],
  [400, 'invalid'],
  [503, 'unavailable'],
])('maps HTTP %s safely without automatic retries', async (status, kind) => {
  request.mockResolvedValue(new Response(null, { status: Number(status) }));
  await expect(
    resendStudentInvitation(row.invitation_id, operation, 'a', signal()),
  ).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([
  ['120', 120],
  [null, 300],
  ['invalid', 300],
  ['0', 300],
])('handles Retry-After %s', async (header, seconds) => {
  request.mockResolvedValue(
    new Response(null, {
      status: 429,
      headers: header ? { 'Retry-After': header } : undefined,
    }),
  );
  await expect(
    resendStudentInvitation(row.invitation_id, operation, 'a', signal()),
  ).rejects.toMatchObject({ kind: 'cooldown', retryAfterSeconds: seconds });
});
it('supports an HTTP date in Retry-After', async () => {
  const date = new Date(Date.now() + 120000).toUTCString();
  request.mockResolvedValue(
    new Response(null, { status: 429, headers: { 'Retry-After': date } }),
  );
  const error = (await resendStudentInvitation(
    row.invitation_id,
    operation,
    'a',
    signal(),
  ).catch((e) => e)) as InvitationError;
  expect(error.kind).toBe('cooldown');
  expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(119);
  expect(error.retryAfterSeconds).toBeLessThanOrEqual(120);
});
it('distinguishes session rejection from unknown network outcomes', async () => {
  request
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockRejectedValueOnce(new TypeError('Network'));
  await expect(listStudentInvitations('a', 0, signal())).rejects.toMatchObject({
    kind: 'session',
  });
  await expect(
    resendStudentInvitation(row.invitation_id, operation, 'a', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  null,
  { ...page, total: -1 },
  { ...page, offset: 20 },
  { ...page, total: 2 },
  { ...page, items: [{ ...row, delivery_status: 'public-link' }] },
  { ...page, items: [row, row], total: 2 },
])('rejects malformed invitation lists', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(listStudentInvitations('a', 0, signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects malformed JSON and mismatched detail/resend identities', async () => {
  request
    .mockResolvedValueOnce(new Response('bad'))
    .mockResolvedValue(Response.json({ ...row, invitation_id: operation }));
  await expect(listStudentInvitations('a', 0, signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  await expect(
    readStudentInvitation(row.invitation_id, 'a', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    resendStudentInvitation(row.invitation_id, operation, 'a', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('validates IDs and pagination before any request', async () => {
  await expect(listStudentInvitations('a', -1, signal())).rejects.toMatchObject(
    { kind: 'invalid' },
  );
  await expect(
    readStudentInvitation('bad', 'a', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    resendStudentInvitation(row.invitation_id, 'bad', 'a', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('calculates the five-minute local wait without negative values', () => {
  expect(
    resendWaitSeconds(row, Date.parse(row.last_requested_at) + 60000),
  ).toBe(240);
  expect(
    resendWaitSeconds(row, Date.parse(row.last_requested_at) + 400000),
  ).toBe(0);
});
