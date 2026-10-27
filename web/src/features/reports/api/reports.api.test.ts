import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  calendarDate,
  exportReport,
  getReport,
  ReportError,
  reportAccessError,
  reportError,
  validatedFilters,
} from './reports.api';
import type { ExportFormat, ReportKind } from '../reports.types';
import {
  reportFilters as filters,
  reportFixture as fixture,
  reportMovement as movement,
  reportLeave as leave,
  reportComplaint as complaint,
  reportID as id,
  otherReportID as otherID,
} from '../../../test/fixtures/reports';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
const kinds = ['attendance', 'daily', 'leaves', 'complaints'] as const;
const path = (kind: ReportKind) =>
  kind === 'daily' ? 'attendance/daily' : kind;
it.each(kinds)(
  'reads %s reports through the authenticated helper with exact filters',
  async (kind) => {
    const body = fixture(kind);
    request.mockResolvedValue(Response.json(body));
    expect(await getReport(kind, filters, 0, 'uid', signal())).toEqual(body);
    expect(request.mock.calls[0]).toEqual([
      `/api/v1/reports/${path(kind)}?from=2026-10-19&to=2026-10-20&limit=20&offset=0`,
      'uid',
      expect.any(AbortSignal),
    ]);
  },
);
it.each(kinds)('accepts empty beyond-end pages for %s', async (kind) => {
  request.mockResolvedValue(Response.json(fixture(kind, 20)));
  expect((await getReport(kind, filters, 20, 'uid', signal())).items).toEqual(
    [],
  );
});
it('normalizes UUID and sends only report-specific nonempty filters', async () => {
  const body = {
    ...fixture('complaints'),
    student_id: id,
    status: 'pending',
    category: 'maintenance',
  };
  request.mockResolvedValue(Response.json(body));
  await getReport(
    'complaints',
    {
      ...filters,
      studentID: ` ${id.toUpperCase()} `,
      status: 'pending',
      category: 'maintenance',
    },
    0,
    'uid',
    signal(),
  );
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/reports/complaints?from=2026-10-19&to=2026-10-20&student_id=${id}&status=pending&category=maintenance&limit=20&offset=0`,
  );
});
it('validates real inclusive calendar dates without browser timezone arithmetic', () => {
  expect(calendarDate('2024-02-29')).toBe(true);
  expect(calendarDate('2025-02-29')).toBe(false);
  expect(calendarDate('0001-01-01')).toBe(true);
  expect(calendarDate('9999-01-01')).toBe(false);
  expect(
    validatedFilters('attendance', {
      ...filters,
      from: '2024-01-01',
      to: '2024-12-31',
    }).to,
  ).toBe('2024-12-31');
});
it.each([
  { from: '', to: '' },
  { from: '2026-02-30' },
  { from: '2026-10-21' },
  { from: '2024-01-01', to: '2025-01-01' },
  { studentID: 'not-a-uuid' },
  { studentID: '00000000-0000-0000-0000-000000000000' },
  { direction: 'in' },
  { status: 'pending' },
  { category: 'maintenance' },
])(
  'rejects invalid attendance filter input %# before requests',
  async (change) => {
    await expect(
      getReport('attendance', { ...filters, ...change }, 0, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it('rejects unsupported kinds, filters, export types and pagination', async () => {
  expect(() => validatedFilters('other' as ReportKind, filters)).toThrow();
  expect(() =>
    validatedFilters('leaves', { ...filters, direction: 'IN' }),
  ).toThrow();
  expect(() =>
    validatedFilters('leaves', { ...filters, status: 'resolved' }),
  ).toThrow();
  expect(() =>
    validatedFilters('leaves', { ...filters, category: 'maintenance' }),
  ).toThrow();
  expect(() =>
    validatedFilters('complaints', { ...filters, status: 'cancelled' }),
  ).toThrow();
  expect(() =>
    validatedFilters('complaints', { ...filters, category: 'other' }),
  ).toThrow();
  for (const offset of [-1, 0.1, 1000001])
    await expect(
      getReport('attendance', filters, offset, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    exportReport('attendance', filters, 'csv' as ExportFormat, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  { from: '2026-10-18' },
  { to: '2026-10-21' },
  { timezone: '' },
  { total: -1 },
  { limit: 100 },
  { offset: 20 },
  { has_more: true },
  { total: 21 },
  { student_id: otherID },
  { status: 'pending' },
  { direction: 'OUT' },
  {
    items: [movement, movement],
    total: 2,
    summary: { entries: 2, exits: 0, distinct_students: 1 },
  },
  { summary: { entries: 1, exits: 0, distinct_students: 2 } },
  { summary: { entries: 0, exits: 0, distinct_students: 0 } },
  { items: [{ ...movement, device_id: 'bad' }] },
  { items: [{ ...movement, occurred_at: 'today' }] },
  { items: [{ ...movement, direction: 'EXIT' }] },
  { items: [{ ...movement, access_result: 'not_evaluated' }] },
  { items: [{ ...movement, access_result: 'approved' }] },
  { items: [{ ...movement, incident_id: 'bad' }] },
])(
  'rejects malformed attendance data or mismatched metadata %#',
  async (change) => {
    request.mockResolvedValue(Response.json({ ...fixture(), ...change }));
    await expect(
      getReport('attendance', filters, 0, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('accepts legacy empty permission metadata and validated linked assessments', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({
        ...fixture(),
        items: [
          {
            ...movement,
            access_result: null,
            late_access_id: null,
            incident_id: null,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        ...fixture(),
        items: [
          { ...movement, access_result: 'approved', late_access_id: otherID },
        ],
      }),
    );
  expect(
    (await getReport('attendance', filters, 0, 'uid', signal())).items,
  ).toHaveLength(1);
  expect(
    (await getReport('attendance', filters, 0, 'uid', signal())).items,
  ).toHaveLength(1);
});
it('rejects rows outside attendance filters and contradictory direction totals', async () => {
  request
    .mockResolvedValueOnce(Response.json({ ...fixture(), student_id: otherID }))
    .mockResolvedValueOnce(Response.json({ ...fixture(), direction: 'OUT' }));
  await expect(
    getReport(
      'attendance',
      { ...filters, studentID: otherID },
      0,
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getReport(
      'attendance',
      { ...filters, direction: 'OUT' },
      0,
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  {
    total: 1,
    items: [{ date: '2026-10-20', entries: 1, exits: 0, distinct_students: 1 }],
  },
  {
    items: [
      { date: '2026-10-19', entries: 1, exits: 0, distinct_students: 1 },
      { date: '2026-10-20', entries: 0, exits: 0, distinct_students: 0 },
    ],
  },
  {
    items: [
      { date: '2026-10-20', entries: 1, exits: 0, distinct_students: 4 },
      { date: '2026-10-19', entries: 0, exits: 0, distinct_students: 0 },
    ],
  },
])(
  'requires all daily dates including zeros in backend date order %#',
  async (change) => {
    request.mockResolvedValue(
      Response.json({ ...fixture('daily'), ...change }),
    );
    await expect(
      getReport('daily', filters, 0, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it('reads all current leave states including pending cancellation without inventing a decision', async () => {
  for (const status of [
    'pending',
    'approved',
    'rejected',
    'cancelled',
  ] as const) {
    const decided = status === 'approved' || status === 'rejected';
    const item = {
      ...leave,
      status,
      decided_at: decided ? leave.created_at : null,
      decided_by: decided ? otherID : null,
      decision_note: decided ? 'Staff decision' : '',
      cancelled_at: status === 'cancelled' ? leave.created_at : null,
      cancelled_by: status === 'cancelled' ? otherID : null,
    };
    request.mockResolvedValueOnce(
      Response.json({
        ...fixture('leaves'),
        items: [item],
        summary: {
          pending: 0,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          [status]: 1,
        },
      }),
    );
    expect(
      (await getReport('leaves', filters, 0, 'uid', signal())).items,
    ).toHaveLength(1);
  }
});
it.each([
  { ...leave, status: 'cancelled' },
  { ...leave, status: 'approved' },
  { ...leave, ends_at: leave.starts_at },
  { ...leave, cancelled_at: leave.created_at },
  { ...leave, reason: '' },
  { ...leave, status: 'other' },
])('rejects contradictory leave records %#', async (item) => {
  request.mockResolvedValue(
    Response.json({ ...fixture('leaves'), items: [item] }),
  );
  await expect(
    getReport('leaves', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects leave summary drift or rows outside current filters', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({
        ...fixture('leaves'),
        summary: { pending: 0, approved: 0, rejected: 0, cancelled: 0 },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...fixture('leaves'), status: 'approved' }),
    );
  await expect(
    getReport('leaves', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getReport('leaves', { ...filters, status: 'approved' }, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('reads resolution audit snapshots and allows a legacy resolved record without audit data', async () => {
  const resolved = {
    ...complaint,
    status: 'resolved',
    resolution: {
      update_id: otherID,
      resolved_at: complaint.updated_at,
      resolved_by: otherID,
      note: 'Fixed',
    },
  };
  for (const item of [resolved, { ...resolved, resolution: null }]) {
    request.mockResolvedValueOnce(
      Response.json({
        ...fixture('complaints'),
        items: [item],
        summary: {
          by_status: { pending: 0, in_progress: 0, resolved: 1 },
          by_category: { maintenance: 1, disciplinary: 0 },
        },
      }),
    );
    expect(
      (await getReport('complaints', filters, 0, 'uid', signal())).items,
    ).toHaveLength(1);
  }
});
it.each([
  { ...complaint, version: 0 },
  { ...complaint, description: '' },
  {
    ...complaint,
    resolution: {
      update_id: otherID,
      resolved_by: otherID,
      resolved_at: complaint.updated_at,
      note: 'Wrong pending resolution',
    },
  },
  { ...complaint, status: 'resolved', resolution: {} },
])('rejects malformed complaint audit data %#', async (item) => {
  request.mockResolvedValue(
    Response.json({ ...fixture('complaints'), items: [item] }),
  );
  await expect(
    getReport('complaints', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('validates independent complaint summaries and category scope', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({
        ...fixture('complaints'),
        summary: {
          by_status: { pending: 0, in_progress: 0, resolved: 0 },
          by_category: { maintenance: 1, disciplinary: 0 },
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...fixture('complaints'), category: 'disciplinary' }),
    );
  await expect(
    getReport('complaints', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getReport(
      'complaints',
      { ...filters, category: 'disciplinary' },
      0,
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each(kinds)(
  'exports all matching %s rows with pagination omitted for PDF and Excel',
  async (kind) => {
    for (const format of ['pdf', 'xlsx'] as const) {
      const mime =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      request.mockResolvedValueOnce(
        new Response(
          format === 'pdf'
            ? '%PDF-1.7 fake bytes'
            : new Uint8Array([80, 75, 3, 4, 0, 0]),
          {
            headers: {
              'Content-Type': mime,
              'Content-Disposition': 'attachment; filename="../../unsafe.exe"',
            },
          },
        ),
      );
      const result = await exportReport(kind, filters, format, 'uid', signal());
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.filename).toBe(
        `hostelhive-${kind === 'daily' ? 'attendance-daily' : kind}-2026-10-19-to-2026-10-20.${format}`,
      );
      expect(request.mock.lastCall).toEqual([
        `/api/v1/reports/${path(kind)}/export${format === 'pdf' ? '/pdf' : ''}?from=2026-10-19&to=2026-10-20`,
        'uid',
        expect.any(AbortSignal),
      ]);
    }
  },
);
it.each([
  ['pdf', 'application/json', '%PDF-fake'],
  ['pdf', 'application/pdf', 'not a PDF'],
  [
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'not a workbook',
  ],
  ['pdf', 'application/pdf', ''],
])(
  'rejects incorrect export MIME/signature/body %#',
  async (format, mime, body) => {
    request.mockResolvedValue(
      new Response(body, { headers: { 'Content-Type': mime } }),
    );
    await expect(
      exportReport(
        'attendance',
        filters,
        format as ExportFormat,
        'uid',
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [413, 'too-large'],
  [429, 'busy'],
  [503, 'unavailable'],
] as const)(
  'handles response %s without downloading JSON errors',
  async (status, kind) => {
    request.mockImplementation(async () =>
      Response.json({ error: 'private backend detail' }, { status }),
    );
    await expect(
      getReport('attendance', filters, 0, 'uid', signal()),
    ).rejects.toMatchObject({ kind });
    await expect(
      exportReport('attendance', filters, 'pdf', 'uid', signal()),
    ).rejects.toMatchObject({ kind });
  },
);
it('handles session rejection, bad JSON, offline and stale aborted data', async () => {
  request.mockRejectedValueOnce(
    new AuthorizedRequestError('session', 'expired'),
  );
  await expect(
    getReport('attendance', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'session' });
  request.mockResolvedValueOnce(new Response('bad JSON'));
  await expect(
    getReport('attendance', filters, 0, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  request.mockRejectedValueOnce(new Error('offline'));
  await expect(
    exportReport('attendance', filters, 'pdf', 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValueOnce(Response.json(fixture()));
  await expect(
    getReport('attendance', filters, 0, 'uid', controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  expect(
    reportAccessError(
      reportError(new AuthorizedRequestError('session', 'expired')),
    ),
  ).toBe(true);
  expect(reportAccessError(new ReportError('forbidden', 'denied'))).toBe(true);
  expect(reportAccessError(reportError(null))).toBe(false);
});
