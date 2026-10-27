import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  emptyHistoryFilters,
  getOwnAttendance,
  validateHistoryFilters,
} from './own-attendance.api';
import { ownHistoryPage } from '../../../test/fixtures/ownAttendance';

vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const reply = (value: unknown) =>
  vi
    .mocked(authorizedRequest)
    .mockResolvedValue(new Response(JSON.stringify(value)));
it('reads only student-owned history with no student ID, request body or staff route', async () => {
  reply(ownHistoryPage());
  const abort = signal();
  expect(await getOwnAttendance('student-uid', abort)).toEqual(
    ownHistoryPage(),
  );
  expect(authorizedRequest).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/me/attendance/events?limit=20&offset=0',
    'student-uid',
    abort,
  );
});
it('sends paired date/direction filters, offset and fixed page size', async () => {
  const filters = {
    from: '2026-10-19',
    to: '2026-10-20',
    direction: 'OUT' as const,
  };
  const page = {
    ...ownHistoryPage(20, 21),
    from: filters.from,
    to: filters.to,
  };
  page.items[0].direction = 'OUT';
  reply(page);
  expect(await getOwnAttendance('uid', signal(), filters, 20)).toEqual(page);
  expect(vi.mocked(authorizedRequest).mock.calls[0][0]).toBe(
    '/api/v1/me/attendance/events?limit=20&offset=20&from=2026-10-19&to=2026-10-20&direction=OUT',
  );
});
it('accepts empty and beyond-end pages and strips unknown private fields', async () => {
  reply(ownHistoryPage(20, 2));
  expect(
    (await getOwnAttendance('uid', signal(), emptyHistoryFilters, 20)).items,
  ).toEqual([]);
  const page = ownHistoryPage();
  reply({
    ...page,
    device_id: 'private',
    items: page.items.map((row) => ({
      ...row,
      device_id: 'private',
      payload_hash: 'secret',
    })),
  });
  expect(await getOwnAttendance('uid', signal())).toEqual(page);
  reply(ownHistoryPage(0, 0));
  expect((await getOwnAttendance('uid', signal())).total).toBe(0);
});
it.each([
  ['2026-10-01', '', 'both'],
  ['', '2026-10-01', 'both'],
  ['2026-02-30', '2026-03-01', 'valid calendar'],
  ['0000-01-01', '0001-01-01', 'valid calendar'],
  ['9998-12-31', '9999-01-01', 'valid calendar'],
  ['2026-10-02', '2026-10-01', 'on or after'],
  ['2024-01-01', '2025-01-01', '366 days'],
])(
  'rejects invalid range %s–%s without a request',
  async (from, to, message) => {
    const filters = { from, to, direction: '' as const };
    expect(validateHistoryFilters(filters)).toContain(message);
    await expect(
      getOwnAttendance('uid', signal(), filters),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(authorizedRequest).not.toHaveBeenCalled();
  },
);
it.each([
  ['', ''],
  ['2024-01-01', '2024-12-31'],
  ['2026-01-01', '2027-01-01'],
  ['2024-02-29', '2024-02-29'],
  ['0001-01-01', '0001-01-01'],
  ['9998-12-31', '9998-12-31'],
])('accepts valid inclusive range %s–%s', (from, to) => {
  expect(validateHistoryFilters({ from, to, direction: '' })).toBe('');
});
it.each([-1, 1.5, 1000001, NaN])(
  'rejects invalid offset %s without reading',
  async (offset) => {
    await expect(
      getOwnAttendance('uid', signal(), emptyHistoryFilters, offset),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(authorizedRequest).not.toHaveBeenCalled();
  },
);
it('rejects unrecognized directions without reading', async () => {
  await expect(
    getOwnAttendance('uid', signal(), {
      ...emptyHistoryFilters,
      direction: 'entry' as 'IN',
    }),
  ).rejects.toThrow('valid movement direction');
  expect(authorizedRequest).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  { ...ownHistoryPage(), items: null },
  { ...ownHistoryPage(), total: -1 },
  { ...ownHistoryPage(), total: 3 },
  { ...ownHistoryPage(), total: '2' },
  { ...ownHistoryPage(), limit: 100 },
  { ...ownHistoryPage(), offset: 20 },
  { ...ownHistoryPage(), has_more: true },
  { ...ownHistoryPage(), timezone: '' },
  { ...ownHistoryPage(), timezone: 'Not/AZone' },
  { ...ownHistoryPage(), from: '2026-10-19' },
  {
    ...ownHistoryPage(),
    items: [ownHistoryPage().items[0], ownHistoryPage().items[0]],
  },
  { ...ownHistoryPage(), items: [...ownHistoryPage().items].reverse() },
  ...['movement_id', 'event_id', 'direction', 'occurred_at'].map((key) => ({
    ...ownHistoryPage(),
    items: ownHistoryPage().items.map((row) => ({ ...row, [key]: 'bad' })),
  })),
])('rejects malformed or inconsistent responses %#', async (body) => {
  reply(body);
  await expect(getOwnAttendance('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects mismatched direction responses and aborted completions', async () => {
  reply(ownHistoryPage());
  await expect(
    getOwnAttendance('uid', signal(), {
      ...emptyHistoryFilters,
      direction: 'IN',
    }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    getOwnAttendance('uid', controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  [400, 'unavailable'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)('handles HTTP %s', async (status, kind) => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response('private server details', { status }),
  );
  await expect(getOwnAttendance('uid', signal())).rejects.toMatchObject({
    kind,
  });
  await expect(getOwnAttendance('uid', signal())).rejects.not.toThrow(
    'private server details',
  );
});
it('handles required setup, token expiry, unreadable JSON and network failures safely', async () => {
  vi.mocked(authorizedRequest)
    .mockResolvedValueOnce(
      new Response('{"error":"setup_required"}', { status: 403 }),
    )
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockResolvedValueOnce(new Response('not json'))
    .mockRejectedValueOnce(new Error('secret'));
  for (const kind of ['setup', 'session', 'unavailable', 'unavailable'])
    await expect(getOwnAttendance('uid', signal())).rejects.toMatchObject({
      kind,
    });
});
