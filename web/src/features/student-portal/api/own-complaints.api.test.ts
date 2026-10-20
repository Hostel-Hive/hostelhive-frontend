import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  addOwnComplaintNote,
  complaintAccessError,
  complaintTextError,
  getOwnComplaint,
  getOwnComplaintHistory,
  listOwnComplaints,
  OwnComplaintError,
  ownComplaintError,
  submitOwnComplaint,
} from './own-complaints.api';
import {
  complaintFixture as row,
  complaintPage,
  createdUpdate,
  noteInput,
  noteUpdate,
} from '../../../test/fixtures/complaints';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const payload = {
  request_id: row.request_id,
  category: row.category,
  description: row.description,
};
beforeEach(() => vi.resetAllMocks());
it('lists owned complaints without ownership selectors or request bodies', async () => {
  request.mockResolvedValue(Response.json(complaintPage([row])));
  expect(
    (await listOwnComplaints('uid', row.student_id, signal())).items,
  ).toEqual([row]);
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/complaints?limit=20&offset=0',
    'uid',
    expect.any(AbortSignal),
  ]);
});
it('filters status/category and paginates including beyond-end pages', async () => {
  request
    .mockResolvedValueOnce(Response.json(complaintPage([row], 20, 21)))
    .mockResolvedValueOnce(Response.json(complaintPage([], 40, 21)));
  await listOwnComplaints(
    'uid',
    row.student_id,
    signal(),
    'pending',
    'maintenance',
    20,
  );
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/complaints?limit=20&offset=20&status=pending&category=maintenance',
  );
  expect(
    (await listOwnComplaints('uid', row.student_id, signal(), '', '', 40))
      .items,
  ).toEqual([]);
});
it.each([
  {
    ...complaintPage([row]),
    items: [{ ...row, student_id: row.submitted_by }],
  },
  complaintPage([row, row]),
  { ...complaintPage([row]), has_more: true },
  { ...complaintPage([row]), limit: 100 },
  { ...complaintPage([row]), total: -1 },
])('rejects unowned or malformed list responses %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    listOwnComplaints('uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects mismatched filters and invalid arguments before sending', async () => {
  request.mockResolvedValue(Response.json(complaintPage([row])));
  await expect(
    listOwnComplaints('uid', row.student_id, signal(), 'resolved'),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    listOwnComplaints('uid', row.student_id, signal(), '', 'disciplinary'),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  request.mockClear();
  await expect(
    listOwnComplaints('uid', 'invalid', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    listOwnComplaints('uid', row.student_id, signal(), '', '', -1),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('normalizes detail IDs and verifies owner and requested complaint', async () => {
  request
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(
      Response.json({ ...row, student_id: row.submitted_by }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...row, complaint_id: row.request_id }),
    );
  expect(
    await getOwnComplaint(
      row.complaint_id.toUpperCase(),
      'uid',
      row.student_id,
      signal(),
    ),
  ).toEqual(row);
  for (let i = 0; i < 2; i++)
    await expect(
      getOwnComplaint(row.complaint_id, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('verifies complaint history parent, order and uniqueness', async () => {
  request.mockResolvedValueOnce(
    Response.json(complaintPage([createdUpdate, noteUpdate])),
  );
  expect(
    (await getOwnComplaintHistory(row, 'uid', row.student_id, signal())).items,
  ).toHaveLength(2);
  for (const items of [
    [noteUpdate, createdUpdate],
    [createdUpdate, createdUpdate],
    [{ ...createdUpdate, complaint_id: row.request_id }],
  ]) {
    request.mockResolvedValueOnce(Response.json(complaintPage(items)));
    await expect(
      getOwnComplaintHistory(row, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('does not request history for another student or invalid offset', async () => {
  await expect(
    getOwnComplaintHistory(row, 'uid', row.submitted_by, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getOwnComplaintHistory(row, 'uid', row.student_id, signal(), -1),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('submits only normalized supported fields and accepts an advanced exact replay', async () => {
  request
    .mockResolvedValueOnce(Response.json(row, { status: 201 }))
    .mockResolvedValueOnce(
      Response.json(
        { ...row, status: 'resolved', version: 3 },
        { status: 201 },
      ),
    );
  await submitOwnComplaint(
    { ...payload, description: ` ${payload.description} ` },
    'uid',
    row.student_id,
    signal(),
  );
  expect(
    (await submitOwnComplaint(payload, 'uid', row.student_id, signal())).status,
  ).toBe('resolved');
  expect(request.mock.calls[0][3]).toEqual({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
  expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
});
it.each(['description', 'request_id', 'category', 'student_id'] as const)(
  'rejects an unrelated submit response: %s',
  async (field) => {
    request.mockResolvedValue(
      Response.json(
        {
          ...row,
          [field]:
            field === 'category'
              ? 'disciplinary'
              : field === 'description'
                ? 'Other'
                : row.submitted_by,
        },
        { status: 201 },
      ),
    );
    await expect(
      submitOwnComplaint(payload, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('submits a note with a stable version and no student/status selectors', async () => {
  request.mockResolvedValue(Response.json(noteUpdate));
  expect(
    await addOwnComplaintNote(row, noteInput, 'uid', row.student_id, signal()),
  ).toEqual(noteUpdate);
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/complaints/${row.complaint_id}/notes`,
  );
  expect(request.mock.calls[0][3]).toEqual({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify(noteInput),
  });
});
it.each([
  { ...noteUpdate, action: 'status' },
  { ...noteUpdate, request_id: row.request_id },
  { ...noteUpdate, previous_version: 2, version: 3 },
  { ...noteUpdate, new_status: 'resolved' },
  { ...noteUpdate, text: 'Other note' },
])('rejects a mismatched note acknowledgement %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    addOwnComplaintNote(row, noteInput, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects resolved notes, changed versions, controls and oversized text before writes', async () => {
  await expect(
    addOwnComplaintNote(
      { ...row, status: 'resolved' },
      noteInput,
      'uid',
      row.student_id,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    addOwnComplaintNote(
      row,
      { ...noteInput, expected_version: 2 },
      'uid',
      row.student_id,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  for (const description of ['', 'a'.repeat(2001), 'unsafe\u0000'])
    await expect(
      submitOwnComplaint(
        { ...payload, description },
        'uid',
        row.student_id,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
  expect(complaintTextError('🙂'.repeat(2000))).toBe('');
  expect(complaintTextError('line\nnext\tline')).toBe('');
});
it.each([
  [401, 'unauthorized', 'session'],
  [403, 'setup_required', 'setup'],
  [403, 'forbidden', 'forbidden'],
  [404, 'not_found', 'not-found'],
  [409, 'complaint_conflict', 'conflict'],
  [409, 'active_student_required', 'ineligible'],
  [400, 'invalid_input', 'invalid'],
  [413, 'too_large', 'invalid'],
  [415, 'unsupported_media_type', 'invalid'],
  [503, 'complaints_unavailable', 'unavailable'],
] as const)('maps HTTP %s %s safely', async (status, error, kind) => {
  request.mockResolvedValue(Response.json({ error }, { status }));
  await expect(
    getOwnComplaint(row.complaint_id, 'uid', row.student_id, signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles malformed JSON, network loss and aborts as uncertain results', async () => {
  request
    .mockResolvedValueOnce(new Response('{', { status: 201 }))
    .mockRejectedValueOnce(new Error('network'));
  for (let i = 0; i < 2; i++)
    await expect(
      submitOwnComplaint(payload, 'uid', row.student_id, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValue(Response.json(row));
  await expect(
    getOwnComplaint(row.complaint_id, 'uid', row.student_id, controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('propagates access failures to the existing portal account verification flow', () => {
  expect(
    complaintAccessError(
      ownComplaintError(new AuthorizedRequestError('session', 'expired')),
    ),
  ).toMatchObject({ kind: 'session' });
  expect(
    complaintAccessError(new OwnComplaintError('setup', 'setup')),
  ).toMatchObject({ kind: 'setup' });
  expect(
    complaintAccessError(new OwnComplaintError('conflict', 'conflict')),
  ).toBeNull();
});
