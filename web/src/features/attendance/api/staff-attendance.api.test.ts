import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  attendanceSearch,
  emptyIncidentFilters,
  getIncident,
  getPresenceSummary,
  listIncidents,
  listPresence,
  validateIncidentFilters,
} from './staff-attendance.api';
import {
  staffPresence as row,
  staffSummary as summary,
  incidentFixture as incident,
  staffPage as page,
} from '../../../test/fixtures/staffAttendance';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('reads authoritative counts with only the supported search query', async () => {
  request.mockResolvedValueOnce(Response.json(summary));
  expect(
    await getPresenceSummary('uid', signal(), '  Sample & name  '),
  ).toEqual(summary);
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/attendance/summary?q=Sample+%26+name',
    'uid',
    expect.any(AbortSignal),
  ]);
  request.mockResolvedValueOnce(
    Response.json({ total: 0, in: 0, out: 0, unknown: 0 }),
  );
  expect((await getPresenceSummary('uid', signal())).total).toBe(0);
  expect(request.mock.calls[1][0]).toBe('/api/v1/attendance/summary');
});
it.each([
  { ...summary, total: 11 },
  { ...summary, in: -1 },
  { ...summary, unknown: '1' },
  { ...summary, out: 1.5 },
  null,
])('rejects malformed summary counts %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(getPresenceSummary('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('lists searched and status-filtered presence with backend pagination', async () => {
  request.mockResolvedValue(Response.json(page([row], 20, 21)));
  expect(await listPresence('uid', signal(), ' Sample ', 'IN', 20)).toEqual(
    page([row], 20, 21),
  );
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/attendance/students?limit=20&offset=20&q=Sample&status=IN',
    'uid',
    expect.any(AbortSignal),
  ]);
});
it('supports UNKNOWN without inventing OUT and accepts empty/beyond-end pages', async () => {
  const unknown = { ...row, status: 'UNKNOWN', updated_at: null };
  request
    .mockResolvedValueOnce(Response.json(page([unknown])))
    .mockResolvedValueOnce(Response.json(page([], 40, 20)));
  expect(
    (await listPresence('uid', signal(), '', 'UNKNOWN')).items[0].updated_at,
  ).toBeNull();
  expect((await listPresence('uid', signal(), '', '', 40)).items).toEqual([]);
});
it.each([
  { ...page([row]), items: [row, row], total: 2 },
  page([{ ...row, student_id: 'bad' }]),
  page([{ ...row, full_name: '' }]),
  page([{ ...row, index_no: 4 }]),
  page([{ ...row, status: 'UNKNOWN' }]),
  page([{ ...row, updated_at: null }]),
  page([{ ...row, status: 'MISSING' }]),
  page([{ ...row, updated_at: 'today' }]),
  { ...page([row]), limit: 100 },
  { ...page([row]), offset: 20 },
  { ...page([row]), has_more: true },
  { ...page([row]), total: 21 },
  null,
])('rejects contradictory or malformed presence pages %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(listPresence('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects a row outside the requested presence status', async () => {
  request.mockResolvedValue(Response.json(page([row])));
  await expect(listPresence('uid', signal(), '', 'OUT')).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([-1, 0.5, 1000001])(
  'validates page offsets %s before sending any requests',
  async (offset) => {
    await expect(
      listPresence('uid', signal(), '', '', offset),
    ).rejects.toMatchObject({ kind: 'invalid' });
    await expect(
      listIncidents('uid', signal(), emptyIncidentFilters, offset),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it('normalizes Unicode search and validates its backend limits', async () => {
  expect(attendanceSearch('  Student  ')).toBe('Student');
  expect(attendanceSearch('🙂'.repeat(200))).toHaveLength(400);
  for (const q of ['a'.repeat(201), 'name\u0000']) {
    await expect(getPresenceSummary('uid', signal(), q)).rejects.toMatchObject({
      kind: 'invalid',
    });
    await expect(listPresence('uid', signal(), q)).rejects.toMatchObject({
      kind: 'invalid',
    });
  }
  await expect(listPresence('uid', signal(), '', 'all')).rejects.toMatchObject({
    kind: 'invalid',
  });
  expect(request).not.toHaveBeenCalled();
});
it('sends only supported nonempty incident filters and accepts IN/late-entry snapshots', async () => {
  request.mockResolvedValueOnce(Response.json(page([incident], 20, 21)));
  const filters = {
    studentID: ` ${row.student_id.toUpperCase()} `,
    direction: 'OUT' as const,
    type: 'early_exit' as const,
  };
  expect(validateIncidentFilters(filters).studentID).toBe(row.student_id);
  expect(await listIncidents('uid', signal(), filters, 20)).toEqual(
    page([incident], 20, 21),
  );
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/attendance/incidents?limit=20&offset=20&student_id=${row.student_id}&direction=OUT&incident_type=early_exit`,
  );
  request.mockResolvedValueOnce(
    Response.json(
      page([{ ...incident, direction: 'IN', incident_type: 'late_entry' }]),
    ),
  );
  expect((await listIncidents('uid', signal())).items[0].direction).toBe('IN');
  expect(request.mock.calls[1][0]).toBe(
    '/api/v1/attendance/incidents?limit=20&offset=0',
  );
});
it.each([
  { studentID: 'not uuid', direction: '', type: '' },
  { studentID: '', direction: 'in', type: '' },
  { studentID: '', direction: '', type: 'resolved' },
])('rejects unsupported incident filters %#', async (filters) => {
  await expect(
    listIncidents('uid', signal(), filters as typeof emptyIncidentFilters),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  { ...incident, incident_id: 'bad' },
  { ...incident, device_id: 'bad' },
  { ...incident, event_id: 'bad' },
  { ...incident, student_id: 'bad' },
  { ...incident, direction: 'IN' },
  { ...incident, occurred_at: 'today' },
  { ...incident, hostel_timezone: '' },
  { ...incident, exit_opening_minute: 1440 },
  { ...incident, entry_deadline_minute: -1 },
  { ...incident, permission_window_seconds: 0 },
  { ...incident, permission_window_seconds: 1.5 },
])('rejects malformed incident policy or event data %#', async (item) => {
  request.mockResolvedValue(Response.json(page([item])));
  await expect(listIncidents('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects duplicate movements and rows outside requested incident filters', async () => {
  request
    .mockResolvedValueOnce(
      Response.json(
        page([incident, { ...incident, incident_id: row.student_id }]),
      ),
    )
    .mockResolvedValueOnce(Response.json(page([incident])))
    .mockResolvedValueOnce(Response.json(page([incident])))
    .mockResolvedValueOnce(Response.json(page([incident])));
  await expect(listIncidents('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  await expect(
    listIncidents('uid', signal(), {
      ...emptyIncidentFilters,
      direction: 'IN',
    }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    listIncidents('uid', signal(), {
      ...emptyIncidentFilters,
      type: 'late_entry',
    }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    listIncidents('uid', signal(), {
      ...emptyIncidentFilters,
      studentID: incident.device_id,
    }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('reads a matching incident without a query or request body', async () => {
  request.mockResolvedValue(Response.json(incident));
  expect(
    await getIncident(incident.incident_id.toUpperCase(), 'uid', signal()),
  ).toEqual(incident);
  expect(request.mock.calls[0]).toEqual([
    `/api/v1/attendance/incidents/${incident.incident_id}`,
    'uid',
    expect.any(AbortSignal),
  ]);
});
it('rejects malformed IDs and mismatched incident acknowledgements', async () => {
  await expect(getIncident('../bad', 'uid', signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValueOnce(
    Response.json({ ...incident, incident_id: row.student_id }),
  );
  await expect(
    getIncident(incident.incident_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)('maps status %s safely', async (status, kind) => {
  request.mockImplementation(async () =>
    Response.json({ error: 'private internal details' }, { status }),
  );
  await expect(getPresenceSummary('uid', signal())).rejects.toMatchObject({
    kind,
  });
  await expect(listPresence('uid', signal())).rejects.toMatchObject({ kind });
  await expect(listIncidents('uid', signal())).rejects.toMatchObject({ kind });
  await expect(
    getIncident(incident.incident_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles malformed JSON, token expiry, offline and aborted late responses', async () => {
  request.mockResolvedValueOnce(new Response('not JSON'));
  await expect(getPresenceSummary('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  request.mockRejectedValueOnce(
    new AuthorizedRequestError('session', 'Sign in again.'),
  );
  await expect(listPresence('uid', signal())).rejects.toMatchObject({
    kind: 'session',
  });
  request.mockRejectedValueOnce(new Error('offline'));
  await expect(listIncidents('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValueOnce(Response.json(incident));
  await expect(
    getIncident(incident.incident_id, 'uid', controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
