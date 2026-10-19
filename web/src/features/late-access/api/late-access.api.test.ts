import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  decideLateAccess,
  decisionNoteError,
  getLateAccess,
  lateAccessError,
  lateAccessFilters,
  listLateAccessRequests,
} from './late-access.api';
import {
  lateAccessFixture as row,
  decidedLateAccess,
  lateAccessPage,
  consumedLateAccess,
} from '../../../test/fixtures/late-access';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it.each(['IN', 'OUT'] as const)(
  'reads %s movement without inferring policy from client time',
  async (direction) => {
    request.mockResolvedValue(Response.json({ ...row, direction }));
    await expect(
      getLateAccess(row.late_access_id, 'staff', signal()),
    ).resolves.toMatchObject({ direction, expected_at: row.expected_at });
  },
);
it('accepts server-recorded consumption separately from approved status', async () => {
  request.mockResolvedValue(Response.json(consumedLateAccess));
  await expect(
    getLateAccess(row.late_access_id, 'staff', signal()),
  ).resolves.toMatchObject({
    status: 'approved',
    consumed_at: consumedLateAccess.consumed_at,
  });
});
it.each([
  { ...row, consumed_at: consumedLateAccess.consumed_at },
  {
    ...decidedLateAccess(),
    consumed_device_id: consumedLateAccess.consumed_device_id,
  },
  { ...consumedLateAccess, consumed_event_id: 'bad' },
  { ...consumedLateAccess, consumed_device_id: 'bad' },
  { ...consumedLateAccess, consumed_at: 'bad' },
  { ...consumedLateAccess, status: 'rejected' },
])('rejects partial or inconsistent consumption %#', async (invalid) => {
  request.mockResolvedValue(Response.json(invalid));
  await expect(
    getLateAccess(row.late_access_id, 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects unsupported direction filters before requesting', async () => {
  await expect(
    listLateAccessRequests(
      new URLSearchParams('direction=IN'),
      'staff',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  { ...decidedLateAccess(), direction: 'OUT' },
  { ...decidedLateAccess(), expected_at: '2027-03-02T10:00:00Z' },
])(
  'rejects a decision acknowledgement for a different movement %#',
  async (invalid) => {
    request.mockResolvedValue(Response.json(invalid));
    await expect(
      decideLateAccess(row, 'approved', 'Reviewed', 'staff', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('lists filtered pages using the authenticated transport and validates filtered ownership', async () => {
  request.mockResolvedValue(Response.json(lateAccessPage([row], 20, 21)));
  await expect(
    listLateAccessRequests(
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
    `/api/v1/late-access-requests?limit=20&offset=20&status=pending&student_id=${row.student_id}`,
    'staff-uid',
  ]);
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it('loads individual details without query parameters or body', async () => {
  request.mockResolvedValue(Response.json(row));
  await expect(
    getLateAccess(row.late_access_id, 'staff', signal()),
  ).resolves.toEqual(row);
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/late-access-requests/${row.late_access_id}`,
  );
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it.each(['approved', 'rejected'] as const)(
  'sends only the normalized %s decision',
  async (status) => {
    request.mockResolvedValue(Response.json(decidedLateAccess(status)));
    await expect(
      decideLateAccess(row, status, ' Reviewed ', 'staff', signal()),
    ).resolves.toMatchObject({ status });
    expect(request).toHaveBeenCalledWith(
      `/api/v1/late-access-requests/${row.late_access_id}/decision`,
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
    decideLateAccess(row, 'approved', '', 'staff', signal()),
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
    decideLateAccess(row, 'approved', '', 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'ineligible' });
  await expect(
    decideLateAccess(row, 'approved', '', 'staff', signal()),
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
    listLateAccessRequests(new URLSearchParams(query), 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('normalizes UUID case and accepts an empty page beyond the filtered total', async () => {
  expect(
    lateAccessFilters(
      new URLSearchParams('student_id=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
    ).get('student_id'),
  ).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  request.mockResolvedValue(Response.json(lateAccessPage([], 100, 1)));
  await expect(
    listLateAccessRequests(
      new URLSearchParams('offset=100'),
      'staff',
      signal(),
    ),
  ).resolves.toMatchObject({ items: [], total: 1 });
});
it.each([
  { ...row, expected_at: 'bad' },
  { ...row, direction: 'SIDEWAYS' },
  { ...row, reason: '' },
  { ...row, student_id: 'bad' },
  { ...row, status: 'cancelled' },
  { ...row, decided_at: row.expected_at },
  { ...decidedLateAccess('rejected'), decision_note: '' },
  { ...decidedLateAccess(), decided_by: null },
])('rejects malformed details %#', async (invalid) => {
  request.mockResolvedValue(Response.json(invalid));
  await expect(
    getLateAccess(row.late_access_id, 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  { ...lateAccessPage(), total: -1 },
  { ...lateAccessPage(), offset: 1 },
  { ...lateAccessPage(), limit: 10 },
  { ...lateAccessPage(), has_more: true },
  { ...lateAccessPage(), items: null },
  lateAccessPage([row, row]),
  lateAccessPage([decidedLateAccess()]),
])('rejects inconsistent listings and mismatched filters %#', async (page) => {
  request.mockResolvedValue(Response.json(page));
  await expect(
    listLateAccessRequests(
      new URLSearchParams('status=pending'),
      'staff',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects wrong detail IDs, student filter mismatches and mismatched decision results', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ ...row, late_access_id: row.request_id }),
    )
    .mockResolvedValueOnce(Response.json(lateAccessPage()))
    .mockResolvedValueOnce(Response.json(decidedLateAccess('rejected')));
  await expect(
    getLateAccess(row.late_access_id, 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    listLateAccessRequests(
      new URLSearchParams({ student_id: row.request_id }),
      'staff',
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    decideLateAccess(row, 'approved', 'Reviewed', 'staff', signal()),
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
  await expect(getLateAccess('bad', 'staff', signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(
    decideLateAccess(decidedLateAccess(), 'approved', '', 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    decideLateAccess(row, 'rejected', '', 'staff', signal()),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('maps session transport failures without exposing internal errors', () => {
  expect(
    lateAccessError(new AuthorizedRequestError('session', 'internal')),
  ).toMatchObject({ kind: 'session' });
  expect(lateAccessError(new TypeError('private details'))).toMatchObject({
    kind: 'unavailable',
  });
});
