import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  listStaff,
  getStaff,
  saveStaff,
  createStaffProfile,
  validStaff,
  staffOffset,
  normalizeStaff,
  validateStaff,
  staffAccessError,
  StaffError,
} from './staff.api';
import {
  staffProfile as profile,
  staffPage as page,
} from '../../../test/fixtures/staffProfiles';
vi.mock('../../auth/api/authorized-request', () => ({
  authorizedRequest: vi.fn(),
  AuthorizedRequestError: class extends Error {
    constructor(
      public kind: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
const request = vi.mocked(authorizedRequest);
const signal = new AbortController().signal;
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const details = { full_name: 'Updated Warden', designation: 'Warden' };
beforeEach(() => {
  vi.resetAllMocks();
  request.mockResolvedValue(response(page()));
});
it('reads supported pagination with no invented filters', async () => {
  expect(await listStaff('admin', signal, 0)).toEqual(page());
  expect(request).toHaveBeenCalledWith(
    '/api/v1/staff?limit=20&offset=0',
    'admin',
    signal,
    undefined,
  );
});
it('uses account UUID for details rather than staff profile UUID', async () => {
  request.mockResolvedValue(response(profile));
  expect(await getStaff(profile.user_id, 'admin', signal)).toEqual(profile);
  expect(request).toHaveBeenCalledWith(
    `/api/v1/staff/${profile.user_id}`,
    'admin',
    signal,
    undefined,
  );
});
it('saves normalized editable fields only with PUT', async () => {
  request.mockResolvedValue(response({ ...profile, ...details }));
  expect(
    await saveStaff(
      profile,
      {
        full_name: ` ${details.full_name} `,
        designation: ` ${details.designation} `,
      },
      'admin',
      signal,
    ),
  ).toEqual({ ...profile, ...details });
  expect(request).toHaveBeenCalledWith(
    `/api/v1/staff/${profile.user_id}`,
    'admin',
    signal,
    {
      method: 'PUT',
      body: JSON.stringify(details),
      contentType: 'application/json',
    },
  );
});
it.each(['', 'offset=20', 'offset=100000'])(
  'parses valid pagination %s',
  (query) =>
    expect(staffOffset(new URLSearchParams(query))).toBe(
      Number(new URLSearchParams(query).get('offset') ?? 0),
    ),
);
it.each([
  'offset=-1',
  'offset=1.5',
  'offset=100001',
  'offset=',
  'offset=0&offset=20',
  'q=warden',
  'role=admin',
])('rejects unsupported pagination %s', (query) =>
  expect(staffOffset(new URLSearchParams(query))).toBeNull(),
);
it.each([-1, 1.5, 100001, NaN])(
  'rejects invalid page %s before requesting',
  async (offset) => {
    await expect(listStaff('admin', signal, offset)).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(request).not.toHaveBeenCalled();
  },
);
it('normalizes and validates Unicode characters by code point', () => {
  expect(
    normalizeStaff({ full_name: '  Name  ', designation: '  Warden ' }),
  ).toEqual({ full_name: 'Name', designation: 'Warden' });
  expect(
    validateStaff({
      full_name: '😀'.repeat(200),
      designation: '名'.repeat(120),
    }),
  ).toEqual({});
});
it.each([
  { full_name: '', designation: '' },
  { full_name: ' '.repeat(10), designation: 'Warden' },
  { full_name: 'a'.repeat(201), designation: 'a'.repeat(121) },
  { full_name: 'name\nname', designation: 'bad\u007fdesignation' },
  { full_name: '\ud800', designation: 'Warden' },
])('validates invalid editable values %j', async (input) => {
  expect(Object.keys(validateStaff(input)).length).toBeGreaterThan(0);
  await expect(
    saveStaff(profile, input, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  null,
  [],
  {},
  { ...profile, staff_id: 'bad' },
  { ...profile, user_id: 'bad' },
  { ...profile, full_name: 1 },
  { ...profile, designation: null },
  { ...profile, email: '' },
  { ...profile, role: 'bad' },
  { ...profile, is_active: 'true' },
  { ...profile, created_at: 'yesterday' },
  { ...profile, updated_at: '2026-10-21' },
  { ...profile, updated_at: '2026-99-99T99:99:99Z' },
])('rejects malformed profiles %j', (value) =>
  expect(validStaff(value)).toBe(false),
);
it('accepts a historical staff profile after its account becomes a student', () =>
  expect(validStaff({ ...profile, role: 'student', is_active: false })).toBe(
    true,
  ));
it.each([
  null,
  {},
  { ...page(), staff: null },
  { ...page(), staff: [{}] },
  { ...page(), limit: 100 },
  { ...page(), offset: 20 },
  { ...page(), has_more: 'false' },
  { ...page(), has_more: true },
  page([profile, profile]),
  page([
    profile,
    { ...profile, staff_id: '60000000-0000-4000-8000-000000000002' },
  ]),
  page(Array.from({ length: 21 }, () => profile)),
])('rejects malformed list %j', async (value) => {
  request.mockResolvedValue(response(value));
  await expect(listStaff('admin', signal, 0)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'missing'],
  [409, 'conflict'],
  [503, 'unavailable'],
  [202, 'unavailable'],
])('handles HTTP %s', async (status, kind) => {
  request.mockResolvedValue(response({}, Number(status)));
  await expect(
    getStaff(profile.user_id, 'admin', signal),
  ).rejects.toMatchObject({ kind });
});
it.each([
  new Error('network'),
  new AuthorizedRequestError('session', 'expired'),
  new AuthorizedRequestError('unavailable', 'offline'),
])('maps transport failures', async (error) => {
  request.mockRejectedValue(error);
  await expect(listStaff('admin', signal, 0)).rejects.toMatchObject({
    kind:
      error instanceof AuthorizedRequestError && error.kind === 'session'
        ? 'session'
        : 'unavailable',
  });
});
it('handles invalid JSON', async () => {
  request.mockResolvedValue(new Response('bad-json'));
  await expect(listStaff('admin', signal, 0)).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects invalid target IDs and mismatched detail responses', async () => {
  await expect(getStaff('me', 'admin', signal)).rejects.toMatchObject({
    kind: 'invalid',
  });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(
    response({ ...profile, user_id: '70000000-0000-4000-8000-000000000002' }),
  );
  await expect(
    getStaff(profile.user_id, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  null,
  profile,
  { ...profile, ...details, staff_id: '60000000-0000-4000-8000-000000000002' },
  { ...profile, ...details, user_id: '70000000-0000-4000-8000-000000000002' },
  { ...profile, full_name: details.full_name, designation: 'different' },
])('rejects unconfirmed save responses %j', async (value) => {
  request.mockResolvedValue(response(value));
  await expect(
    saveStaff(profile, details, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('identifies access failures without treating other errors as access denial', () => {
  expect(staffAccessError(new StaffError('session', 'expired'))).toBe(true);
  expect(staffAccessError(new StaffError('forbidden', 'denied'))).toBe(true);
  expect(staffAccessError(new StaffError('unavailable', 'offline'))).toBe(
    false,
  );
  expect(staffAccessError(null)).toBe(false);
});
it('creates a missing profile addressed by confirmed account ID', async () => {
  request.mockResolvedValue(response({ ...profile, ...details }));
  expect(
    await createStaffProfile(profile.user_id, details, 'admin', signal),
  ).toEqual({ ...profile, ...details });
  expect(request).toHaveBeenCalledWith(
    `/api/v1/staff/${profile.user_id}`,
    'admin',
    signal,
    {
      method: 'PUT',
      contentType: 'application/json',
      body: JSON.stringify(details),
    },
  );
});
it('rejects invalid creation input and unconfirmed profiles', async () => {
  await expect(
    createStaffProfile('bad', details, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    createStaffProfile(
      profile.user_id,
      { ...details, full_name: '' },
      'admin',
      signal,
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(response(profile));
  await expect(
    createStaffProfile(profile.user_id, details, 'admin', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
