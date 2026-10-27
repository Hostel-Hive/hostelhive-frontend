import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  listOwnLateAccess,
  getOwnLateAccess,
  submitOwnLateAccess,
  prepareLateAccessSubmission,
  validateLateAccessDraft,
  ownLateAccessError,
  lateAccessAccountError,
  OwnLateAccessError,
  cancelOwnLateAccess,
} from './own-late-access.api';
import type {
  LateAccessDraft,
  LateAccessSubmission,
} from './own-late-access.api';
import {
  studentAccessFixture as row,
  studentAccessPage,
  studentConsumedAccess,
  studentDecidedAccess,
  ownLateAccessFixture,
} from '../../../test/fixtures/ownLateAccess';
import { lateAccessPage } from '../../../test/fixtures/late-access';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const payload: LateAccessSubmission = {
  request_id: row.request_id,
  direction: row.direction,
  expected_at: row.expected_at,
  reason: row.reason,
};
const draft: LateAccessDraft = {
  direction: 'IN',
  expected: '2099-03-01T21:00',
  reason: ' Travel delay ',
};
beforeEach(() => vi.resetAllMocks());
const cancelled = {
  ...row,
  status: 'cancelled',
  cancelled_at: '2027-02-21T10:00:00Z',
  cancelled_by: row.submitted_by,
};
it('cancels using an empty POST and retains only student-safe cancellation details', async () => {
  request.mockResolvedValue(Response.json(cancelled));
  const result = await cancelOwnLateAccess(
    row.late_access_id,
    'student',
    row.student_id,
    signal(),
  );
  expect(result).toMatchObject({
    status: 'cancelled',
    cancelled_at: cancelled.cancelled_at,
  });
  expect(result).not.toHaveProperty('cancelled_by');
  expect(request).toHaveBeenCalledWith(
    `/api/v1/late-access-requests/${row.late_access_id}/cancel`,
    'student',
    expect.any(AbortSignal),
    { method: 'POST' },
  );
});
it.each([401, 403, 404, 409, 503])(
  'reports cancellation rejection %s without retrying the write',
  async (status) => {
    request.mockResolvedValue(
      Response.json({ error: 'late_access_conflict' }, { status }),
    );
    await expect(
      cancelOwnLateAccess(
        row.late_access_id,
        'student',
        row.student_id,
        signal(),
      ),
    ).rejects.toBeInstanceOf(OwnLateAccessError);
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { ...cancelled, student_id: '99999999-9999-4999-8999-999999999999' },
  { ...cancelled, cancelled_at: null },
  { ...cancelled, cancelled_by: null },
  row,
])(
  'rejects an invalid or unowned cancellation acknowledgement',
  async (body) => {
    request.mockResolvedValue(Response.json(body));
    await expect(
      cancelOwnLateAccess(
        row.late_access_id,
        'student',
        row.student_id,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('filters cancelled records for both student and staff validators', async () => {
  request.mockResolvedValue(
    Response.json(lateAccessPage([cancelled as typeof row])),
  );
  const result = await listOwnLateAccess(
    'student',
    row.student_id,
    signal(),
    'cancelled',
  );
  expect(result.items[0].status).toBe('cancelled');
  expect(request.mock.calls[0][0]).toContain('status=cancelled');
});
it('lists owned requests without submitting a student ID or body', async () => {
  request.mockResolvedValue(Response.json(studentAccessPage()));
  expect(await listOwnLateAccess('student', row.student_id, signal())).toEqual({
    ...studentAccessPage(),
    items: [ownLateAccessFixture],
  });
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/late-access-requests?limit=20&offset=0',
  );
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it('supports status filters, pagination and empty beyond-end pages', async () => {
  request
    .mockResolvedValueOnce(Response.json(lateAccessPage([row], 20, 21)))
    .mockResolvedValueOnce(Response.json(lateAccessPage([], 40, 21)));
  expect(
    (await listOwnLateAccess('uid', row.student_id, signal(), 'pending', 20))
      .has_more,
  ).toBe(false);
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/late-access-requests?limit=20&offset=20&status=pending',
  );
  expect(
    (await listOwnLateAccess('uid', row.student_id, signal(), '', 40)).items,
  ).toEqual([]);
});
it('gets owned details and exposes consumption time without staff/scanner identity', async () => {
  request.mockResolvedValue(Response.json(studentConsumedAccess));
  const result = await getOwnLateAccess(
    row.late_access_id,
    'uid',
    row.student_id,
    signal(),
  );
  expect(result).toMatchObject({
    status: 'approved',
    consumed_at: studentConsumedAccess.consumed_at,
  });
  for (const field of [
    'submitted_by',
    'decided_by',
    'consumed_device_id',
    'consumed_event_id',
    'student_id',
  ])
    expect(result).not.toHaveProperty(field);
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/late-access-requests/${row.late_access_id}`,
  );
});
it.each(['IN', 'OUT'] as const)(
  'submits only the normalized %s payload and retains idempotency on retry',
  async (direction) => {
    const input = { ...payload, direction };
    request
      .mockResolvedValueOnce(
        Response.json({ ...row, direction }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { ...studentDecidedAccess(), direction },
          { status: 201 },
        ),
      );
    expect(
      (await submitOwnLateAccess(input, 'uid', row.student_id, signal()))
        .direction,
    ).toBe(direction);
    expect(
      (await submitOwnLateAccess(input, 'uid', row.student_id, signal()))
        .status,
    ).toBe('approved');
    expect(request.mock.calls[0][3]).toEqual({
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify(input),
    });
    expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
  },
);
it('normalizes device-local minutes and trims the reason without hardcoding backend policy', () => {
  expect(
    prepareLateAccessSubmission(draft, row.request_id.toUpperCase()),
  ).toEqual({
    request_id: row.request_id,
    direction: 'IN',
    expected_at: new Date(draft.expected).toISOString(),
    reason: 'Travel delay',
  });
  // A daytime request may be rejected by the server. Client policy cannot know
  // the configured hostel timezone/opening/deadline and must not guess them.
  expect(
    validateLateAccessDraft({ ...draft, expected: '2099-03-01T09:00' }),
  ).toBe('');
});
it('allows exact replay after the expected time has passed', async () => {
  const input = { ...payload, expected_at: '2000-03-01T16:00:00.000Z' };
  request.mockResolvedValue(
    Response.json(
      { ...studentDecidedAccess(), expected_at: input.expected_at },
      { status: 201 },
    ),
  );
  expect(
    (await submitOwnLateAccess(input, 'uid', row.student_id, signal()))
      .expected_at,
  ).toBe(input.expected_at);
  expect(JSON.parse(String(request.mock.calls[0][3]?.body))).toEqual(input);
});
it.each([
  [{ ...draft, direction: '' }, 'Choose'],
  [{ ...draft, direction: 'ENTRY' }, 'Choose'],
  [{ ...draft, expected: '' }, 'valid expected'],
  [{ ...draft, expected: '2099-02-30T21:00' }, 'valid expected'],
  [{ ...draft, expected: '0000-01-01T21:00' }, 'valid expected'],
  [{ ...draft, expected: '2000-01-01T21:00' }, 'future'],
  [{ ...draft, reason: '  ' }, 'reason'],
  [{ ...draft, reason: 'x'.repeat(1001) }, '1000'],
  [{ ...draft, reason: 'bad\u0000' }, 'control'],
])('rejects invalid draft %#', (input, message) => {
  expect(validateLateAccessDraft(input as LateAccessDraft)).toContain(message);
  expect(() =>
    prepareLateAccessSubmission(input as LateAccessDraft, row.request_id),
  ).toThrow();
});
it('counts Unicode code points, permits newline/tab and validates request UUID', () => {
  expect(validateLateAccessDraft({ ...draft, reason: '😀'.repeat(1000) })).toBe(
    '',
  );
  expect(
    validateLateAccessDraft({ ...draft, reason: 'Travel\nrequest\tdetails' }),
  ).toBe('');
  expect(() => prepareLateAccessSubmission(draft, 'bad')).toThrow();
});
it.each([
  { ...studentAccessPage(), items: [{ ...row, student_id: row.submitted_by }] },
  { ...studentAccessPage(), items: [row, row], total: 2 },
  { ...studentAccessPage(), items: [{}] },
  { ...studentAccessPage(), items: null },
  { ...studentAccessPage(), total: '1' },
  { ...studentAccessPage(), total: 2 },
  { ...studentAccessPage(), has_more: true },
  { ...studentAccessPage(), limit: 100 },
  { ...studentAccessPage(), offset: 20 },
  {
    ...studentAccessPage(),
    items: [{ ...row, consumed_at: '2027-03-01T16:10:00Z' }],
  },
  null,
])('rejects malformed/foreign listings %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    listOwnLateAccess('uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects mismatched status and foreign/mismatched detail IDs', async () => {
  request
    .mockResolvedValueOnce(Response.json(studentAccessPage()))
    .mockResolvedValueOnce(
      Response.json({ ...row, student_id: row.submitted_by }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...row, late_access_id: row.request_id }),
    );
  await expect(
    listOwnLateAccess('uid', row.student_id, signal(), 'rejected'),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLateAccess(row.late_access_id, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLateAccess(row.late_access_id, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each(['request_id', 'reason', 'direction', 'expected_at', 'student_id'])(
  'rejects mismatched submission acknowledgment %s',
  async (key) => {
    const values: Record<string, string> = {
      request_id: row.late_access_id,
      reason: 'Different',
      direction: 'OUT',
      expected_at: '2027-03-02T16:00:00Z',
      student_id: row.submitted_by,
    };
    request.mockResolvedValue(
      Response.json({ ...row, [key]: values[key] }, { status: 201 }),
    );
    await expect(
      submitOwnLateAccess(payload, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('rejects invalid request parameters without sending them', async () => {
  await expect(listOwnLateAccess('uid', 'bad', signal())).rejects.toMatchObject(
    { kind: 'invalid' },
  );
  await expect(
    listOwnLateAccess('uid', row.student_id, signal(), 'bad' as 'pending'),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    listOwnLateAccess('uid', row.student_id, signal(), '', -1),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    getOwnLateAccess('bad', 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    submitOwnLateAccess(
      { ...payload, direction: 'bad' as 'IN' },
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
    submitOwnLateAccess(payload, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind });
});
it('explains server policy rejection without assuming client timezone equals hostel timezone', async () => {
  request.mockResolvedValue(
    Response.json({ error: 'invalid_input' }, { status: 400 }),
  );
  await expect(
    submitOwnLateAccess(payload, 'uid', row.student_id, signal()),
  ).rejects.toThrow('require permission under hostel policy');
});
it('handles setup, ineligibility, expired credentials, invalid JSON and network failure', async () => {
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
    .mockResolvedValueOnce(new Response('bad JSON'))
    .mockRejectedValueOnce(new Error('secret'));
  for (const kind of [
    'ineligible',
    'setup',
    'session',
    'unavailable',
    'unavailable',
  ])
    await expect(
      listOwnLateAccess('uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind });
  expect(ownLateAccessError(new Error('secret')).message).not.toContain(
    'secret',
  );
  expect(
    lateAccessAccountError(new OwnLateAccessError('setup', 'Setup')),
  ).toMatchObject({ kind: 'setup' });
  expect(
    lateAccessAccountError(new OwnLateAccessError('invalid', 'Check')),
  ).toBeNull();
});
it('ignores aborted completions', async () => {
  const abort = new AbortController();
  abort.abort();
  request
    .mockResolvedValueOnce(Response.json(studentAccessPage()))
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(Response.json(row, { status: 201 }));
  await expect(
    listOwnLateAccess('uid', row.student_id, abort.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnLateAccess(row.late_access_id, 'uid', row.student_id, abort.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    submitOwnLateAccess(payload, 'uid', row.student_id, abort.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
