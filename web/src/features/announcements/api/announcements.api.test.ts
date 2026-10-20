import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  announcementAccessError,
  announcementError,
  getAnnouncement,
  getAnnouncementSummary,
  listAnnouncements,
  publicationValidation,
  publishAnnouncement,
} from './announcements.api';
import {
  announcementFixture as row,
  announcementPage,
  publicationFixture as input,
  summaryFixture,
} from '../../../test/fixtures/announcements';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('reads a feed through authenticated pagination without invented filters or bodies', async () => {
  request.mockResolvedValue(Response.json(announcementPage()));
  expect(await listAnnouncements('uid', signal())).toEqual(announcementPage());
  expect(request.mock.calls[0]).toEqual([
    '/api/v1/announcements?limit=20&offset=0',
    'uid',
    expect.any(AbortSignal),
  ]);
});
it('reads later and beyond-end pages', async () => {
  request
    .mockResolvedValueOnce(Response.json(announcementPage([row], 20, 21)))
    .mockResolvedValueOnce(Response.json(announcementPage([], 40, 21)));
  expect((await listAnnouncements('uid', signal(), 20)).items).toEqual([row]);
  expect((await listAnnouncements('uid', signal(), 40)).items).toEqual([]);
});
it.each([
  { ...announcementPage(), items: [row, row], total: 2 },
  { ...announcementPage(), items: [{ ...row, audience: 'block' }] },
  { ...announcementPage(), items: [{ ...row, priority: 'urgent' }] },
  { ...announcementPage(), items: [{ ...row, published_at: 'yesterday' }] },
  { ...announcementPage(), items: [{ ...row, title: 'a'.repeat(161) }] },
  { ...announcementPage(), items: [{ ...row, content: '' }] },
  { ...announcementPage(), has_more: true },
  { ...announcementPage(), total: -1 },
  { ...announcementPage(), limit: 100 },
  { ...announcementPage(), total: 21 },
])('rejects malformed or inconsistent feed responses %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(listAnnouncements('uid', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('validates pagination and IDs before requests', async () => {
  for (const offset of [-1, 0.5, Number.MAX_SAFE_INTEGER])
    await expect(
      listAnnouncements('uid', signal(), offset),
    ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    getAnnouncement('invalid', 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    getAnnouncementSummary(
      '00000000-0000-0000-0000-000000000000',
      'uid',
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it('gets a matching announcement and rejects a different response ID', async () => {
  request
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(
      Response.json({ ...row, announcement_id: row.published_by }),
    );
  expect(
    await getAnnouncement(row.announcement_id.toUpperCase(), 'uid', signal()),
  ).toEqual(row);
  await expect(
    getAnnouncement(row.announcement_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('reads staff delivery counters from a matching snapshot', async () => {
  request.mockResolvedValue(Response.json(summaryFixture));
  expect(
    await getAnnouncementSummary(row.announcement_id, 'uid', signal()),
  ).toEqual(summaryFixture);
  expect(request.mock.calls[0][0]).toBe(
    `/api/v1/announcements/${row.announcement_id}/delivery-summary`,
  );
});
it.each([
  { ...summaryFixture, announcement_id: row.published_by },
  { ...summaryFixture, delivered: 7 },
  { ...summaryFixture, read: 4 },
  { ...summaryFixture, unread: -1 },
  { ...summaryFixture, recipients_total: Number.MAX_SAFE_INTEGER + 1 },
])('rejects invalid delivery invariants %#', async (body) => {
  request.mockResolvedValue(Response.json(body));
  await expect(
    getAnnouncementSummary(row.announcement_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('publishes supported normalized fields only and accepts the exact replay', async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ announcement: row, replayed: false }, { status: 201 }),
    )
    .mockResolvedValueOnce(
      Response.json({ announcement: row, replayed: true }),
    );
  await publishAnnouncement(
    { ...input, title: ` ${input.title} `, content: ` ${input.content} ` },
    'uid',
    row.published_by,
    signal(),
  );
  expect(
    (await publishAnnouncement(input, 'uid', row.published_by, signal()))
      .replayed,
  ).toBe(true);
  expect(request.mock.calls[0][3]).toEqual({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify(input),
  });
  expect(request.mock.calls[1][3]).toEqual(request.mock.calls[0][3]);
});
it.each([
  { announcement: { ...row, title: 'Other title' }, replayed: false },
  { announcement: { ...row, content: 'Other content' }, replayed: false },
  {
    announcement: { ...row, published_by: row.announcement_id },
    replayed: false,
  },
  { announcement: row, replayed: true },
])('rejects unrelated publication acknowledgement %#', async (body) => {
  request.mockResolvedValue(Response.json(body, { status: 201 }));
  await expect(
    publishAnnouncement(input, 'uid', row.published_by, signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('validates title/content as Unicode characters and disallows unsupported controls', async () => {
  expect(publicationValidation('🙂'.repeat(160), '🙂'.repeat(5000))).toBe('');
  expect(publicationValidation('Title', 'Line\nNext\tline')).toBe('');
  for (const [title, content] of [
    ['', 'text'],
    ['a'.repeat(161), 'text'],
    ['Line\nNext', 'text'],
    ['Title', ''],
    ['Title', 'a'.repeat(5001)],
    ['Title', 'bad\u0000'],
  ]) {
    expect(publicationValidation(title, content)).not.toBe('');
    await expect(
      publishAnnouncement(
        { ...input, title, content },
        'uid',
        row.published_by,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
  }
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [400, 'invalid_input', 'invalid'],
  [401, 'unauthorized', 'session'],
  [403, 'setup_required', 'setup'],
  [403, 'forbidden', 'forbidden'],
  [404, 'not_found', 'not-found'],
  [409, 'announcement_conflict', 'conflict'],
  [413, 'payload_too_large', 'invalid'],
  [415, 'unsupported_media_type', 'invalid'],
  [503, 'announcements_unavailable', 'unavailable'],
] as const)('maps HTTP %s %s safely', async (status, error, kind) => {
  request.mockResolvedValue(Response.json({ error }, { status }));
  await expect(
    getAnnouncement(row.announcement_id, 'uid', signal()),
  ).rejects.toMatchObject({ kind });
});
it('handles transport rejection, malformed success JSON and aborted requests', async () => {
  request
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce(new Response('{', { status: 201 }));
  for (let i = 0; i < 2; i++)
    await expect(
      publishAnnouncement(input, 'uid', row.published_by, signal()),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  request.mockResolvedValue(Response.json(announcementPage()));
  await expect(
    listAnnouncements('uid', controller.signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  expect(
    announcementAccessError(
      announcementError(new AuthorizedRequestError('session', 'expired')),
    ),
  ).toBe(true);
  expect(announcementAccessError(announcementError(null))).toBe(false);
});
