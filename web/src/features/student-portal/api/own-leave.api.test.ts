import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  getOwnLeave,
  listOwnLeaves,
  submitOwnLeave,
  prepareLeaveSubmission,
  validateLeaveDraft,
  ownLeaveError,
  leaveAccessError,
  OwnLeaveError,
} from './own-leave.api';
import type { LeaveSubmission } from './own-leave.api';
import {
  studentLeaveFixture as row,
  studentLeavePage,
  studentDecidedLeave,
  ownLeaveFixture,
} from '../../../test/fixtures/ownLeave';
import { leavePage } from '../../../test/fixtures/leave';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const payload: LeaveSubmission = {
  request_id: row.request_id,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  reason: row.reason,
};
const draft = {
  start: '2099-03-01T10:00',
  end: '2099-03-03T10:00',
  reason: ' Family visit ',
};
beforeEach(() => vi.resetAllMocks());
it('lists only owned requests without student/user ID, request body or staff decision calls', async () => {
  request.mockResolvedValue(Response.json(studentLeavePage()));
  expect(await listOwnLeaves('student', row.student_id, signal())).toEqual({
    ...studentLeavePage(),
    items: [ownLeaveFixture],
  });
  expect(request.mock.calls[0][0]).toBe('/api/v1/leaves?limit=20&offset=0');
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it('filters by status, paginates and accepts beyond-end pages', async () => {
  request
    .mockResolvedValueOnce(Response.json(leavePage([row], 20, 21)))
    .mockResolvedValueOnce(Response.json(leavePage([], 40, 21)));
  expect(
    (await listOwnLeaves('uid', row.student_id, signal(), 'pending', 20))
      .has_more,
  ).toBe(false);
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/leaves?limit=20&offset=20&status=pending',
  );
  expect(
    (await listOwnLeaves('uid', row.student_id, signal(), '', 40)).items,
  ).toEqual([]);
});
it('gets owned details and strips staff/account identity fields', async () => {
  request.mockResolvedValue(Response.json(studentDecidedLeave('rejected')));
  const result = await getOwnLeave(
    row.leave_id.toUpperCase(),
    'uid',
    row.student_id,
    signal(),
  );
  expect(result).toMatchObject({
    status: 'rejected',
    decision_note: 'Reviewed',
  });
  expect(result).not.toHaveProperty('submitted_by');
  expect(result).not.toHaveProperty('decided_by');
  expect(request.mock.calls[0][0]).toBe(`/api/v1/leaves/${row.leave_id}`);
});
it('submits only the idempotent normalized payload and accepts an exact retry already decided', async () => {
  request
    .mockResolvedValueOnce(Response.json(row, { status: 201 }))
    .mockResolvedValueOnce(
      Response.json(studentDecidedLeave(), { status: 201 }),
    );
  expect(
    await submitOwnLeave(payload, 'uid', row.student_id, signal()),
  ).toEqual(ownLeaveFixture);
  expect(
    (await submitOwnLeave(payload, 'uid', row.student_id, signal())).status,
  ).toBe('approved');
  expect(request.mock.calls[0][0]).toBe('/api/v1/leaves');
  expect(request.mock.calls[0][3]).toEqual({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
  expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
});
it('converts device-local minutes to RFC3339 UTC and trims the reason', () => {
  const result = prepareLeaveSubmission(draft, row.request_id.toUpperCase());
  expect(result).toEqual({
    request_id: row.request_id,
    starts_at: new Date(draft.start).toISOString(),
    ends_at: new Date(draft.end).toISOString(),
    reason: 'Family visit',
  });
});
it.each([
  [{ ...draft, start: '' }, 'valid start'],
  [{ ...draft, end: 'bad' }, 'valid start'],
  [{ ...draft, start: '2099-02-30T10:00' }, 'valid start'],
  [{ ...draft, start: '0000-01-01T10:00' }, 'valid start'],
  [{ ...draft, start: '2000-01-01T10:00' }, 'future'],
  [{ ...draft, end: draft.start }, 'after'],
  [{ ...draft, reason: '  ' }, 'reason'],
  [{ ...draft, reason: 'x'.repeat(1001) }, '1000'],
  [{ ...draft, reason: 'bad\u0000' }, 'control'],
])('validates submission draft %#', (input, message) => {
  expect(validateLeaveDraft(input)).toContain(message);
  expect(() => prepareLeaveSubmission(input, row.request_id)).toThrow();
});
it('counts Unicode characters and allows newline/tab in the reason', () => {
  expect(validateLeaveDraft({ ...draft, reason: '😀'.repeat(1000) })).toBe('');
  expect(
    validateLeaveDraft({ ...draft, reason: 'Family\nvisit\trequest' }),
  ).toBe('');
  expect(() => prepareLeaveSubmission(draft, 'bad')).toThrow();
});
it.each([
  { ...studentLeavePage(), items: [{ ...row, student_id: row.submitted_by }] },
  { ...studentLeavePage(), items: [row, row], total: 2 },
  { ...studentLeavePage(), items: [{}] },
  { ...studentLeavePage(), items: null },
  { ...studentLeavePage(), total: '1' },
  { ...studentLeavePage(), total: 2 },
  { ...studentLeavePage(), has_more: true },
  { ...studentLeavePage(), limit: 100 },
  { ...studentLeavePage(), offset: 20 },
  null,
])('rejects inconsistent/foreign listings %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    listOwnLeaves('uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects mismatched filter/IDs and cross-student details', async () => {
  request
    .mockResolvedValueOnce(Response.json(studentLeavePage()))
    .mockResolvedValueOnce(
      Response.json({ ...row, student_id: row.submitted_by }),
    )
    .mockResolvedValueOnce(Response.json({ ...row, leave_id: row.request_id }));
  await expect(
    listOwnLeaves('uid', row.student_id, signal(), 'rejected'),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLeave(row.leave_id, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLeave(row.leave_id, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each(['request_id', 'reason', 'starts_at', 'ends_at', 'student_id'])(
  'rejects mismatched submission acknowledgment %s',
  async (key) => {
    const values: Record<string, string> = {
      request_id: row.leave_id,
      reason: 'Different',
      starts_at: '2027-03-01T11:00:00Z',
      ends_at: '2027-03-04T10:00:00Z',
      student_id: row.submitted_by,
    };
    request.mockResolvedValue(
      Response.json({ ...row, [key]: values[key] }, { status: 201 }),
    );
    await expect(
      submitOwnLeave(payload, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('rejects invalid inputs before making any request', async () => {
  await expect(listOwnLeaves('uid', 'bad', signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(
    listOwnLeaves('uid', row.student_id, signal(), 'bad' as 'pending'),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    listOwnLeaves('uid', row.student_id, signal(), '', -1),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    getOwnLeave('bad', 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    submitOwnLeave(
      { ...payload, request_id: 'bad' },
      'uid',
      row.student_id,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [409, 'conflict'],
  [413, 'invalid'],
  [415, 'invalid'],
  [503, 'unavailable'],
] as const)('maps HTTP %s safely', async (status, kind) => {
  request.mockResolvedValue(
    Response.json({ error: 'private server details' }, { status }),
  );
  await expect(
    submitOwnLeave(payload, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles setup, ineligibility, token errors and malformed JSON without leaking server details', async () => {
  request
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: 'active_student_required' } },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({ error: 'setup_required' }, { status: 403 }),
    )
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockResolvedValueOnce(new Response('not json'))
    .mockRejectedValueOnce(new Error('secret'));
  for (const kind of [
    'ineligible',
    'setup',
    'session',
    'unavailable',
    'unavailable',
  ])
    await expect(
      listOwnLeaves('uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind });
  expect(ownLeaveError(new Error('secret')).message).not.toContain('secret');
  expect(leaveAccessError(new OwnLeaveError('setup', 'Setup'))).toMatchObject({
    kind: 'setup',
  });
  expect(leaveAccessError(new OwnLeaveError('invalid', 'Check'))).toBeNull();
});
it('ignores aborted read and write completions', async () => {
  const controller = new AbortController();
  controller.abort();
  request
    .mockResolvedValueOnce(Response.json(studentLeavePage()))
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(Response.json(row, { status: 201 }));
  await expect(
    listOwnLeaves('uid', row.student_id, controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLeave(row.leave_id, 'uid', row.student_id, controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    submitOwnLeave(payload, 'uid', row.student_id, controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
