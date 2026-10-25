import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  activeFaculties,
  changeFaculty,
  facultyNameError,
  getFaculty,
  listFaculties,
} from './faculties.api';
import { faculty, facultyPage } from '../../../test/fixtures/faculties';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
beforeEach(() => vi.resetAllMocks());
it('reads paginated status filters and individual details', async () => {
  request
    .mockResolvedValueOnce(Response.json(facultyPage))
    .mockResolvedValueOnce(Response.json(faculty));
  expect(await listFaculties('admin', signal(), 'all')).toEqual(facultyPage);
  expect(request.mock.calls[0][0]).toBe(
    '/api/v1/faculties?active=all&limit=20&offset=0',
  );
  expect(await getFaculty(faculty.faculty_id, 'admin', signal())).toEqual(
    faculty,
  );
});
it.each(['create', 'rename', 'activate', 'deactivate'] as const)(
  'sends the correct %s operation',
  async (action) => {
    const row = { ...faculty, is_active: action !== 'deactivate' };
    request.mockResolvedValue(Response.json(row));
    expect(
      await changeFaculty(
        action,
        'admin',
        signal(),
        faculty.faculty_id,
        ' Science ',
      ),
    ).toEqual(row);
    const call = request.mock.calls[0];
    expect(call[0]).toBe(
      '/api/v1/faculties' +
        (action === 'create'
          ? ''
          : '/' +
            faculty.faculty_id +
            (action === 'rename' ? '' : '/' + action)),
    );
    expect(call[3]?.method).toBe(action === 'rename' ? 'PATCH' : 'POST');
    expect(call[3]?.body).toBe(
      ['create', 'rename'].includes(action)
        ? JSON.stringify({ name: 'Science' })
        : undefined,
    );
  },
);
it.each([
  ['', 'name'],
  ['   ', 'name'],
  ['A'.repeat(121), 'length'],
  ['Bad\nName', 'control'],
])('rejects invalid names %j before writing', async (name) => {
  expect(facultyNameError(name)).toBeTruthy();
  await expect(
    changeFaculty('create', 'a', signal(), undefined, name),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'missing'],
  [409, 'conflict'],
  [400, 'invalid'],
  [503, 'unavailable'],
])('handles HTTP %s without retrying', async (status, kind) => {
  request.mockResolvedValue(new Response(null, { status: Number(status) }));
  await expect(listFaculties('a', signal())).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it('preserves session errors and treats a network failure as uncertain', async () => {
  request
    .mockRejectedValueOnce(new AuthorizedRequestError('session', 'Expired'))
    .mockRejectedValueOnce(new TypeError('Network'));
  await expect(listFaculties('a', signal())).rejects.toMatchObject({
    kind: 'session',
  });
  await expect(
    changeFaculty('create', 'a', signal(), undefined, 'Science'),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  null,
  { ...facultyPage, offset: 20 },
  { ...facultyPage, items: [{ ...faculty, is_active: 'yes' }] },
  { ...facultyPage, items: [faculty, faculty] },
  { ...facultyPage, items: [{ ...faculty, updated_at: 'bad' }] },
])('rejects malformed list responses', async (value) => {
  request.mockResolvedValue(Response.json(value));
  await expect(listFaculties('a', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects mismatched mutation and detail identities', async () => {
  request.mockResolvedValue(
    Response.json({
      ...faculty,
      faculty_id: '22345678-1234-4234-8234-123456789abc',
    }),
  );
  await expect(
    getFaculty(faculty.faculty_id, 'a', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    changeFaculty('deactivate', 'a', signal(), faculty.faculty_id),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('loads every page of active faculties for selectors', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    ...faculty,
    faculty_id: `12345678-1234-4234-8234-${String(i).padStart(12, '0')}`,
  }));
  request
    .mockResolvedValueOnce(
      Response.json({
        ...facultyPage,
        items: rows,
        limit: 100,
        has_more: true,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...facultyPage, limit: 100, offset: 100 }),
    );
  expect(await activeFaculties('a', signal())).toHaveLength(101);
  expect(request.mock.calls[1][0]).toContain('offset=100');
});
it('rejects inactive records from an active catalogue', async () => {
  request.mockResolvedValue(
    Response.json({
      ...facultyPage,
      limit: 100,
      items: [{ ...faculty, is_active: false }],
    }),
  );
  await expect(activeFaculties('a', signal())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
it('rejects invalid pagination and identities before network requests', async () => {
  await expect(listFaculties('a', signal(), 'true', -1)).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(getFaculty('bad', 'a', signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  await expect(
    changeFaculty('rename', 'a', signal(), 'bad', 'Science'),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(request).not.toHaveBeenCalled();
});
