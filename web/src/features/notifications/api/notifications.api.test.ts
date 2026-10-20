import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
  notificationAccessError,
  notificationError,
  NotificationError,
  notificationSource,
} from './notifications.api';
import {
  notificationFixture as row,
  notificationPage as page,
  readNotification,
} from '../../../test/fixtures/notifications';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('uses an authenticated owned list with only supported pagination and unread filters', async () => {
  request.mockResolvedValue(Response.json(page()));
  expect(await listNotifications('uid', signal())).toEqual(page());
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/notifications?limit=20&offset=0&unread=false',
    'uid',
    expect.any(AbortSignal),
  ]);
  request.mockResolvedValue(Response.json(page([row], 20, 21)));
  expect(await listNotifications('uid', signal(), true, 20)).toEqual(
    page([row], 20, 21),
  );
  expect(request.mock.calls[1][0]).toBe(
    '/api/v1/notifications?limit=20&offset=20&unread=true',
  );
});
it('accepts empty and beyond-end pages', async () => {
  request
    .mockResolvedValueOnce(Response.json(page([])))
    .mockResolvedValueOnce(Response.json(page([], 20, 0)));
  expect((await listNotifications('uid', signal())).items).toEqual([]);
  expect((await listNotifications('uid', signal(), false, 20)).items).toEqual(
    [],
  );
});
it.each([
  { ...page(), items: [row, row], total: 2 },
  { ...page(), items: [{ ...row, notification_id: 'bad' }] },
  { ...page(), items: [{ ...row, complaint_id: '../outside' }] },
  { ...page(), items: [{ ...row, leave_id: row.complaint_id }] },
  { ...page(), items: [{ ...row, source_type: 'https://example.com' }] },
  { ...page(), items: [{ ...row, kind: 'announcement_published' }] },
  { ...page(), items: [{ ...row, title: '' }] },
  { ...page(), items: [{ ...row, title: '\u0000' }] },
  { ...page(), items: [{ ...row, read_at: 'yesterday' }] },
  { ...page(), items: [{ ...row, created_at: null }] },
  { ...page(), items: [{ ...row, occurred_at: 'today' }] },
  { ...page(), items: [{ ...row, status: 2 }] },
  { ...page(), items: [{ ...row, category: {} }] },
  { ...page(), total: -1 },
  { ...page(), offset: 20 },
  { ...page(), limit: 100 },
  { ...page(), has_more: true },
  { ...page(), total: 21 },
  null,
])(
  'rejects malformed/private cross-source or inconsistent results %#',
  async (body) => {
    request.mockResolvedValue(Response.json(body));
    await expect(listNotifications('uid', signal())).rejects.toMatchObject({
      kind: 'unavailable',
    });
  },
);
it('rejects a read item in an unread-only response', async () => {
  request.mockResolvedValue(Response.json(page([readNotification])));
  await expect(listNotifications('uid', signal(), true)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER])(
  'rejects invalid offsets %s before requesting',
  async (offset) => {
    await expect(
      listNotifications('uid', signal(), false, offset),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it('reads authoritative unread counts including zero', async () => {
  request
    .mockResolvedValueOnce(Response.json({ unread: 0 }))
    .mockResolvedValueOnce(Response.json({ unread: 1000 }));
  expect(await getUnreadCount('uid', signal())).toBe(0);
  expect(await getUnreadCount('uid', signal())).toBe(1000);
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/notifications/unread-count',
    'uid',
    expect.any(AbortSignal),
  ]);
});
it.each([
  { unread: -1 },
  { unread: 1.5 },
  { unread: '1' },
  { unread: Number.MAX_SAFE_INTEGER + 1 },
  {},
])('rejects invalid unread counters %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(getUnreadCount('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('marks a single notification read with an empty POST and supports identical retry', async () => {
  request.mockImplementation(async () => Response.json(readNotification));
  expect(
    await markNotificationRead(
      row.notification_id.toUpperCase(),
      'uid',
      signal(),
    ),
  ).toEqual(readNotification);
  expect(
    await markNotificationRead(row.notification_id, 'uid', signal()),
  ).toEqual(readNotification);
  expect(request.mock.calls[0]).toEqual([
    `/api/v1/notifications/${row.notification_id}/read`,
    'uid',
    expect.any(AbortSignal),
    { method: 'POST' },
  ]);
});
it.each([row, { ...readNotification, notification_id: row.complaint_id }, {}])(
  'requires a matching read acknowledgement %#',
  async (body) => {
    request.mockResolvedValue(Response.json(body));
    await expect(
      markNotificationRead(row.notification_id, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  },
);
it.each(['bad', '00000000-0000-0000-0000-000000000000'])(
  'rejects malformed notification IDs %s',
  async (id) => {
    await expect(
      markNotificationRead(id, 'uid', signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [503, 'unavailable'],
] as const)('maps status %s to safe error %s', async (status, kind) => {
  request.mockResolvedValue(
    Response.json({ error: 'private internals' }, { status }),
  );
  await expect(listNotifications('uid', signal())).rejects.toMatchObject({
    kind,
  });
  await expect(getUnreadCount('uid', signal())).rejects.toMatchObject({ kind });
  await expect(
    markNotificationRead(row.notification_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles setup, network, malformed JSON, expired Firebase token and late aborted responses', async () => {
  request.mockResolvedValueOnce(
    Response.json({ error: 'setup_required' }, { status: 403 }),
  );
  await expect(getUnreadCount('uid', signal())).rejects.toMatchObject({
    kind: 'setup',
  });
  request.mockRejectedValueOnce(new Error('secret internals'));
  await expect(getUnreadCount('uid', signal())).rejects.toThrow(
    'Notifications could not be confirmed',
  );
  request.mockResolvedValueOnce(new Response('not JSON'));
  await expect(getUnreadCount('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
  request.mockRejectedValueOnce(
    new AuthorizedRequestError('session', 'expired'),
  );
  await expect(getUnreadCount('uid', signal())).rejects.toMatchObject({
    kind: 'session',
  });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValueOnce(Response.json({ unread: 1 }));
  await expect(getUnreadCount('uid', controller.signal)).rejects.toMatchObject({
    kind: 'unavailable',
  });
  expect(
    notificationAccessError(
      notificationError(new AuthorizedRequestError('session', 'expired')),
    ),
  ).toBe(true);
  expect(
    notificationAccessError(new NotificationError('forbidden', 'denied')),
  ).toBe(true);
  expect(notificationAccessError(notificationError(null))).toBe(false);
});
it.each(['student', 'admin', 'warden'] as const)(
  'builds local existing source routes for %s',
  (role) => {
    const base = role === 'student' ? '/student' : '/dashboard';
    expect(notificationSource(row, role)).toBe(
      `${base}/complaints/${row.complaint_id}`,
    );
    expect(
      notificationSource(
        { ...row, source_type: 'leave', leave_id: row.complaint_id },
        role,
      ),
    ).toBe(`${base}/leaves/${row.complaint_id}`);
    expect(
      notificationSource(
        {
          ...row,
          source_type: 'late_access',
          late_access_id: row.complaint_id,
        },
        role,
      ),
    ).toBe(`${base}/late-access-requests/${row.complaint_id}`);
    expect(
      notificationSource(
        {
          ...row,
          source_type: 'announcement',
          announcement_id: row.complaint_id,
        },
        role,
      ),
    ).toBe(`${base}/announcements/${row.complaint_id}`);
    expect(
      notificationSource(
        {
          ...row,
          source_type: 'attendance',
          attendance_incident_id: row.complaint_id,
        },
        role,
      ),
    ).toBeUndefined();
  },
);
it.each([
  {
    ...row,
    source_type: 'leave',
    complaint_id: undefined,
    leave_id: row.complaint_id,
    kind: 'leave_decided',
  },
  {
    ...row,
    source_type: 'late_access',
    complaint_id: undefined,
    late_access_id: row.complaint_id,
    kind: 'late_access_decided',
  },
  {
    ...row,
    source_type: 'announcement',
    complaint_id: undefined,
    announcement_id: row.complaint_id,
    kind: 'announcement_published',
  },
  {
    ...row,
    source_type: 'attendance',
    complaint_id: undefined,
    attendance_incident_id: row.complaint_id,
    kind: 'attendance_incident',
  },
])('reads each supported backend source %#', async (item) => {
  request.mockResolvedValue(Response.json(page([item as typeof row])));
  expect((await listNotifications('uid', signal())).items[0].source_type).toBe(
    item.source_type,
  );
});
