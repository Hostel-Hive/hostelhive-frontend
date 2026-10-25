import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  listOwnPasses,
  passHistoryQuery,
  validPass,
  type PassQuery,
} from './pass-history.api';
import {
  leavePass,
  accessPass,
  approvedPass,
  cancelledPass,
  passPage,
} from '../../../test/fixtures/passHistory';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const query: PassQuery = { type: '', status: '', offset: 0 };
beforeEach(() => vi.resetAllMocks());
it('reads one combined feed without sending a student identity or GET body', async () => {
  request.mockResolvedValue(Response.json(passPage()));
  expect(
    (await listOwnPasses('student', leavePass.student_id, query, signal()))
      .items,
  ).toEqual([accessPass, leavePass]);
  expect(request).toHaveBeenCalledWith(
    '/api/v1/me/passes?limit=20&offset=0',
    'student',
    expect.any(AbortSignal),
  );
});
it('sends exact type/status filters with pagination', async () => {
  request.mockResolvedValue(Response.json(passPage([approvedPass], 20, 21)));
  await listOwnPasses(
    's',
    leavePass.student_id,
    { type: 'late_access', status: 'approved', offset: 20 },
    signal(),
  );
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/me/passes?limit=20&offset=20&type=late_access&status=approved',
  );
});
it('keeps used approvals Approved and accepts cancelled historical records', async () => {
  request.mockResolvedValue(
    Response.json(passPage([approvedPass, cancelledPass])),
  );
  expect(
    (await listOwnPasses('s', leavePass.student_id, query, signal())).items,
  ).toEqual([approvedPass, cancelledPass]);
});
it('does not collapse identical source IDs belonging to different request types', async () => {
  request.mockResolvedValue(Response.json(passPage([accessPass, leavePass])));
  expect(
    (await listOwnPasses('s', leavePass.student_id, query, signal())).items,
  ).toHaveLength(2);
});
it.each([
  'status=consumed',
  'type=going_home',
  'student_id=example',
  'status=',
  'offset=-1',
  'offset=1000001',
  'status=approved&status=pending',
  'limit=100',
  'offset=no',
])('rejects unsupported URL filters: %s', (search) => {
  expect(passHistoryQuery(new URLSearchParams(search))).toBeNull();
});
it('accepts supported URL filters and backend offset bounds', () => {
  expect(
    passHistoryQuery(
      new URLSearchParams('type=leave&status=cancelled&offset=20'),
    ),
  ).toEqual({ type: 'leave', status: 'cancelled', offset: 20 });
  expect(passHistoryQuery(new URLSearchParams('offset=1'))?.offset).toBe(1);
});
it.each([
  { ...accessPass, student_id: '44444444-4444-4444-8444-444444444444' },
  { ...accessPass, type: 'going_home' },
  { ...accessPass, direction: null },
  { ...leavePass, starts_at: null },
  { ...leavePass, ends_at: leavePass.starts_at },
  { ...accessPass, status: 'consumed' },
  { ...accessPass, consumed_at: approvedPass.consumed_at },
  { ...leavePass, cancelled_at: cancelledPass.cancelled_at },
  { ...approvedPass, decided_by: null },
  { ...cancelledPass, cancelled_by: null },
  { ...leavePass, consumed_at: approvedPass.consumed_at },
])('rejects foreign or inconsistent pass rows', (value) => {
  expect(validPass(value, leavePass.student_id)).toBe(false);
});
it.each([
  null,
  { ...passPage(), offset: 20 },
  { ...passPage(), total: 3 },
  { ...passPage(), items: [leavePass, leavePass] },
  {
    ...passPage(),
    items: [
      { ...leavePass, student_id: '44444444-4444-4444-8444-444444444444' },
    ],
    total: 1,
  },
])('rejects invalid pages atomically', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects rows which do not match the applied filters', async () => {
  request.mockResolvedValue(Response.json(passPage([accessPass])));
  await expect(
    listOwnPasses(
      's',
      leavePass.student_id,
      { ...query, type: 'leave' },
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [409, 'not-found'],
  [503, 'unavailable'],
  [400, 'unavailable'],
])('handles HTTP %s safely', async (status, kind) => {
  request.mockResolvedValue(new Response(null, { status: Number(status) }));
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind });
});
it('recognises setup-required rejection and auth transport failures', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ error: 'setup_required' }, { status: 403 }),
    )
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockRejectedValueOnce(new TypeError('Network'));
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind: 'setup' });
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('validates caller inputs and rejects malformed JSON', async () => {
  await expect(
    listOwnPasses('s', 'bad', query, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(new Response('bad'));
  await expect(
    listOwnPasses('s', leavePass.student_id, query, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
