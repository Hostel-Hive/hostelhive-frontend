import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  actionError,
  changeComplaint,
  complaintError,
  complaintFilters,
  getComplaint,
  listComplaints,
  listComplaintUpdates,
  transitions,
} from './complaints.api';
import {
  complaintFixture as row,
  complaintPage,
  createdUpdate,
  noteUpdate,
  noteInput,
} from '../../../test/fixtures/complaints';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('lists with all supported filters using the authenticated transport', async () => {
  const params = new URLSearchParams({
    student_id: row.student_id,
    status: 'pending',
    category: 'maintenance',
    created_from: row.created_at,
    created_to: '2026-10-20T10:00:00Z',
    offset: '20',
  });
  request.mockResolvedValue(Response.json(complaintPage([row], 20, 21)));
  await expect(
    listComplaints(params, 'staff', signal()),
  ).resolves.toMatchObject({ total: 21 });
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/complaints?${complaintFilters(params)}`,
  );
  expect(request.mock.calls[0][1]).toBe('staff');
  expect(request.mock.calls[0][3]).toBeUndefined();
});
it('gets details and paginated chronological history without list filters', async () => {
  request
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(
      Response.json(complaintPage([createdUpdate, noteUpdate])),
    );
  await expect(
    getComplaint(row.complaint_id, 'staff', signal()),
  ).resolves.toEqual(row);
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal()),
  ).resolves.toMatchObject({ items: [createdUpdate, noteUpdate] });
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    `/api/v1/complaints/${row.complaint_id}`,
    `/api/v1/complaints/${row.complaint_id}/updates?limit=20&offset=0`,
  ]);
});
it('sends a note with its exact UUID and version and strips unsupported fields', async () => {
  request.mockResolvedValue(Response.json(noteUpdate));
  const input = { ...noteInput, text: ' Repair assigned ', actor_id: 'forged' };
  await expect(changeComplaint(row, input, 'staff', signal())).resolves.toEqual(
    noteUpdate,
  );
  expect(request).toHaveBeenCalledWith(
    `/api/v1/complaints/${row.complaint_id}/notes`,
    'staff',
    expect.any(AbortSignal),
    {
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify(noteInput),
    },
  );
});
it.each([
  ['pending', 'in_progress', ''],
  ['pending', 'resolved', 'Fixed'],
  ['in_progress', 'resolved', 'Fixed'],
  ['resolved', 'in_progress', 'Problem returned'],
] as const)('supports %s → %s', async (previous, next, text) => {
  request.mockResolvedValue(
    Response.json({
      ...noteUpdate,
      action: 'status',
      previous_status: previous,
      new_status: next,
      text,
    }),
  );
  await expect(
    changeComplaint(
      { ...row, status: previous },
      { ...noteInput, status: next, text },
      'staff',
      signal(),
    ),
  ).resolves.toMatchObject({ new_status: next });
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/complaints/${row.complaint_id}/status`,
  );
});
it('uses only backend-supported transitions', () => {
  expect(transitions('pending')).toEqual(['in_progress', 'resolved']);
  expect(transitions('in_progress')).toEqual(['resolved']);
  expect(transitions('resolved')).toEqual(['in_progress']);
  expect(
    actionError({ ...row, status: 'resolved' }, undefined, 'Note'),
  ).toContain('Resolved');
  expect(
    actionError({ ...row, status: 'in_progress' }, 'in_progress', ''),
  ).toContain('supported');
  expect(actionError(row, 'resolved', '')).toContain('explanation');
  expect(
    actionError({ ...row, status: 'resolved' }, 'in_progress', ''),
  ).toContain('explanation');
});
it('validates Unicode length, required notes and control characters', () => {
  expect(actionError(row, undefined, ' ')).toContain('explanation');
  expect(actionError(row, undefined, '🛏'.repeat(2000))).toBeNull();
  expect(actionError(row, undefined, 'a'.repeat(2001))).toContain('2000');
  expect(actionError(row, undefined, '\u0000')).toContain('control');
  expect(actionError(row, undefined, 'Line1\nLine2\tOK')).toBeNull();
  expect(
    actionError(
      { ...row, version: Number.MAX_SAFE_INTEGER },
      undefined,
      'Note',
    ),
  ).toContain('version');
});
it.each([
  'status=bad',
  'status=',
  'category=bad',
  'student_id=bad',
  'offset=-1',
  'offset=1.2',
  'offset=9007199254740992',
  'status=pending&status=pending',
  'limit=100',
  'q=anything',
  'created_from=bad',
  'created_from=2026-10-20T10:00:00Z&created_to=2026-10-19T10:00:00Z',
])('rejects invalid filter %s before requesting', async (query) => {
  await expect(
    listComplaints(new URLSearchParams(query), 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [409, 'conflict'],
  [503, 'unavailable'],
  [415, 'unavailable'],
])('handles HTTP %s without automatic retry', async (status, kind) => {
  request.mockResolvedValue(Response.json({}, { status: Number(status) }));
  await expect(
    changeComplaint(row, noteInput, 'staff', signal()),
  ).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([
  { ...row, version: 0 },
  { ...row, category: 'unknown' },
  { ...row, status: 'deleted' },
  { ...row, student_id: 'bad' },
  { ...row, created_at: 'bad' },
  { ...row, description: '' },
])('rejects malformed complaints %#', async (invalid) => {
  request.mockResolvedValue(Response.json(invalid));
  await expect(
    getComplaint(row.complaint_id, 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  complaintPage([row, row]),
  { ...complaintPage([row]), total: -1 },
  { ...complaintPage([row]), limit: 10 },
  { ...complaintPage([row]), offset: 1 },
  { ...complaintPage([row]), has_more: true },
  { ...complaintPage([row]), items: null },
])('rejects inconsistent list pages %#', async (invalid) => {
  request.mockResolvedValue(Response.json(invalid));
  await expect(
    listComplaints(new URLSearchParams(), 'staff', signal()),
  ).rejects.toThrow();
});
it('checks exact filter matches and exclusive date upper boundary', async () => {
  request.mockResolvedValue(Response.json(complaintPage([row])));
  for (const query of [
    `student_id=${row.request_id}`,
    'status=resolved',
    'category=disciplinary',
    `created_to=${row.created_at}`,
    'created_from=2026-10-20T10:00:00Z',
  ])
    await expect(
      listComplaints(new URLSearchParams(query), 'staff', signal()),
    ).rejects.toThrow();
});
it.each([
  { ...noteUpdate, previous_version: 0 },
  { ...noteUpdate, version: 5 },
  { ...createdUpdate, previous_status: 'pending' },
  { ...noteUpdate, actor_id: 'bad' },
  { ...noteUpdate, action: 'unknown' },
  { ...noteUpdate, complaint_id: row.request_id },
])('rejects malformed or wrong-owner history %#', async (invalid) => {
  request.mockResolvedValue(Response.json(complaintPage([invalid])));
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal()),
  ).rejects.toThrow();
});
it('accepts historical image events without fetching images, rejects invalid image references and unsorted history', async () => {
  const image = {
    ...noteUpdate,
    action: 'image_added',
    image_id: row.request_id,
  };
  request
    .mockResolvedValueOnce(Response.json(complaintPage([image])))
    .mockResolvedValueOnce(
      Response.json(complaintPage([{ ...image, image_id: undefined }])),
    )
    .mockResolvedValueOnce(
      Response.json(complaintPage([noteUpdate, createdUpdate])),
    );
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal()),
  ).resolves.toMatchObject({ items: [image] });
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal()),
  ).rejects.toThrow();
});
it.each([
  'request_id',
  'previous_version',
  'action',
  'text',
  'complaint_id',
  'previous_status',
  'new_status',
] as const)('verifies mutation acknowledgement %s', async (field) => {
  request.mockResolvedValue(
    Response.json({
      ...noteUpdate,
      [field]: field === 'previous_version' ? 8 : 'wrong',
    }),
  );
  await expect(
    changeComplaint(row, noteInput, 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects invalid IDs/versions and resolved notes before sending', async () => {
  await expect(getComplaint('bad', 'staff', signal())).rejects.toThrow();
  await expect(
    listComplaintUpdates(row.complaint_id, 'staff', signal(), -1),
  ).rejects.toThrow();
  await expect(
    changeComplaint(
      row,
      { ...noteInput, expected_version: 2 },
      'staff',
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    changeComplaint(
      { ...row, status: 'resolved' },
      noteInput,
      'staff',
      signal(),
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it('accepts empty later pages and maps transport errors safely', async () => {
  request.mockResolvedValue(Response.json(complaintPage([], 100, 1)));
  await expect(
    listComplaints(new URLSearchParams('offset=100'), 'staff', signal()),
  ).resolves.toMatchObject({ total: 1 });
  expect(
    complaintError(new AuthorizedRequestError('session', 'private')),
  ).toMatchObject({ kind: 'session' });
  expect(complaintError(new Error('private'))).toMatchObject({
    kind: 'unavailable',
  });
});
