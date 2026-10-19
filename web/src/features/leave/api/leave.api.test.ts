import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  decideLeave,
  decisionNoteError,
  getLeave,
  leaveError,
  leaveFilters,
  listLeaves,
} from './leave.api';
import {
  leaveFixture as row,
  decidedLeave,
  leavePage,
} from '../../../test/fixtures/leave';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('lists filtered pages using the authenticated transport and validates filtered ownership', async () => {
  request.mockResolvedValue(Response.json(leavePage([row], 20, 21)));
  await expect(
    listLeaves(
      new URLSearchParams({
        status: 'pending',
        student_id: row.student_id,
        offset: '20',
      }),
      'staff-uid',
      signal(),
    ),
  ).resolves.toMatchObject({ total: 21 });
  expect(request.mock.calls[0].slice(0, 2)).toEqual([
    `/api/v1/leaves?limit=20&offset=20&status=pending&student_id=${row.student_id}`,
    'staff-uid',
  ]);
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it('loads individual details without query parameters or body', async () => {
  request.mockResolvedValue(Response.json(row));
  await expect(getLeave(row.leave_id, 'staff', signal())).resolves.toEqual(row);
  expect(request.mock.calls[0][0]).toBe(`/api/v1/leaves/${row.leave_id}`);
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it.each(['approved', 'rejected'] as const)(
  'sends only the normalized %s decision',
  async (status) => {
    request.mockResolvedValue(Response.json(decidedLeave(status)));
    await expect(
      decideLeave(row, status, ' Reviewed ', 'staff', signal()),
    ).resolves.toMatchObject({ status });
    expect(request).toHaveBeenCalledWith(
      `/api/v1/leaves/${row.leave_id}/decision`,
      'staff',
      expect.any(AbortSignal),
      {
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ status, note: 'Reviewed' }),
      },
    );
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [409, 'conflict'],
  [503, 'unavailable'],
  [415, 'unavailable'],
])('maps HTTP %s without retrying', async (status, kind) => {
  request.mockResolvedValue(
    Response.json({ error: 'failure' }, { status: Number(status) }),
  );
  await expect(
    decideLeave(row, 'approved', '', 'staff', signal()),
  ).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it('distinguishes ineligible students and tolerates an unreadable conflict body', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ error: 'active_student_required' }, { status: 409 }),
    )
    .mockResolvedValueOnce(new Response('bad', { status: 409 }));
  await expect(
    decideLeave(row, 'approved', '', 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'ineligible' });
  await expect(
    decideLeave(row, 'approved', '', 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'conflict' });
});
it.each([
  'status=bad',
  'status=',
  'status=pending&status=approved',
  'q=anything',
  'student_id=bad',
  'offset=-1',
  'offset=1.5',
  'offset=9007199254740992',
])('rejects unsupported filters %s before requesting', async (query) => {
  await expect(
    listLeaves(new URLSearchParams(query), 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('normalizes UUID case and accepts an empty page beyond the filtered total', async () => {
  expect(
    leaveFilters(
      new URLSearchParams('student_id=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
    ).get('student_id'),
  ).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  request.mockResolvedValue(Response.json(leavePage([], 100, 1)));
  await expect(
    listLeaves(new URLSearchParams('offset=100'), 'staff', signal()),
  ).resolves.toMatchObject({ items: [], total: 1 });
});
it.each([
  { ...row, starts_at: 'bad' },
  { ...row, ends_at: row.starts_at },
  { ...row, reason: '' },
  { ...row, student_id: 'bad' },
  { ...row, status: 'cancelled' },
  { ...row, decided_at: row.starts_at },
  { ...decidedLeave('rejected'), decision_note: '' },
  { ...decidedLeave(), decided_by: null },
])('rejects malformed details %#', async (invalid) => {
  request.mockResolvedValue(Response.json(invalid));
  await expect(getLeave(row.leave_id, 'staff', signal())).rejects.toMatchObject(
    { kind: 'unavailable' },
  );
});
it.each([
  { ...leavePage(), total: -1 },
  { ...leavePage(), offset: 1 },
  { ...leavePage(), limit: 10 },
  { ...leavePage(), has_more: true },
  { ...leavePage(), items: null },
  leavePage([row, row]),
  leavePage([decidedLeave()]),
])('rejects inconsistent listings and mismatched filters %#', async (page) => {
  request.mockResolvedValue(Response.json(page));
  await expect(
    listLeaves(new URLSearchParams('status=pending'), 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects wrong detail IDs, student filter mismatches and mismatched decision results', async () => {
  request
    .mockResolvedValueOnce(Response.json({ ...row, leave_id: row.request_id }))
    .mockResolvedValueOnce(Response.json(leavePage()))
    .mockResolvedValueOnce(Response.json(decidedLeave('rejected')));
  await expect(getLeave(row.leave_id, 'staff', signal())).rejects.toThrow();
  await expect(
    listLeaves(
      new URLSearchParams({ student_id: row.request_id }),
      'staff',
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    decideLeave(row, 'approved', 'Reviewed', 'staff', signal()),
  ).rejects.toThrow();
});
it('validates decision notes using Unicode length and permits newline and tabs', () => {
  expect(decisionNoteError('rejected', ' ')).toContain('reason');
  expect(decisionNoteError('approved', '🛏'.repeat(1000))).toBeNull();
  expect(decisionNoteError('approved', 'a'.repeat(1001))).toContain('1000');
  expect(decisionNoteError('approved', '\u0000')).toContain('control');
  expect(decisionNoteError('approved', 'Line 1\nLine 2\tOK')).toBeNull();
});
it('rejects invalid IDs, finalized decisions and blank rejection before sending', async () => {
  await expect(getLeave('bad', 'staff', signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(
    decideLeave(decidedLeave(), 'approved', '', 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    decideLeave(row, 'rejected', '', 'staff', signal()),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('maps session transport failures without exposing internal errors', () => {
  expect(
    leaveError(new AuthorizedRequestError('session', 'internal')),
  ).toMatchObject({ kind: 'session' });
  expect(leaveError(new TypeError('private details'))).toMatchObject({
    kind: 'unavailable',
  });
});
