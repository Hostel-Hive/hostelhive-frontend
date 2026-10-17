import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { listAllocations, changeAllocation } from './allocation.api';
import { studentFixture } from '../../../test/fixtures/student';
import {
  allocationFixture,
  newAllocationFixture,
  allocationPage,
} from '../../../test/fixtures/allocation';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff', getIdToken: vi.fn() };
const auth = {
  currentUser: user as typeof user | null,
  authStateReady: vi.fn(),
};
const fetchMock = vi.fn();
const signal = () => new AbortController().signal;
const id = studentFixture.student_id;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  auth.currentUser = user;
  user.getIdToken.mockResolvedValue('private-token');
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('requests student-filtered active and paginated history with bearer authorization and no cache', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(allocationPage([allocationFixture]))),
  );
  await expect(
    listAllocations(id, user.uid, signal(), 0, true),
  ).resolves.toMatchObject({ total: 1 });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(
    `/backend-api/api/v1/allocations?student_id=${id}&limit=10&offset=0&active=true`,
  );
  expect(options).toMatchObject({
    headers: { Authorization: 'Bearer private-token' },
    cache: 'no-store',
    credentials: 'omit',
  });
  expect(options).not.toHaveProperty('body');
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(allocationPage([], 10, 10))),
  );
  await listAllocations(id, user.uid, signal(), 10);
  expect(fetchMock.mock.calls[1][0]).toContain('offset=10');
  expect(fetchMock.mock.calls[1][0]).not.toContain('active=');
});
it.each(['assign', 'transfer', 'revoke'] as const)(
  'sends only the %s contract fields and accepts the documented response',
  async (action) => {
    const revoked = {
      ...allocationFixture,
      ended_at: '2026-10-02T12:00:00Z',
      ended_by: studentFixture.user_id,
      end_reason: 'revoked',
    };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(action === 'revoke' ? revoked : newAllocationFixture),
        { status: action === 'assign' ? 201 : 200 },
      ),
    );
    await changeAllocation(
      action,
      id,
      user.uid,
      signal(),
      allocationFixture.allocation_id,
      newAllocationFixture.bed_id,
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `/backend-api/api/v1/allocations${action === 'assign' ? '' : `/${allocationFixture.allocation_id}/${action}`}`,
    );
    expect(options.method).toBe('POST');
    if (action === 'revoke') {
      expect(options).not.toHaveProperty('body');
      expect(options.headers).not.toHaveProperty('Content-Type');
    } else
      expect(JSON.parse(options.body)).toEqual(
        action === 'assign'
          ? { student_id: id, bed_id: newAllocationFixture.bed_id }
          : { bed_id: newAllocationFixture.bed_id },
      );
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [413, 'invalid'],
  [415, 'invalid'],
  [503, 'unavailable'],
] as const)(
  'handles HTTP %s without retrying a write',
  async (status, kind) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(
      changeAllocation(
        'assign',
        id,
        user.uid,
        signal(),
        undefined,
        newAllocationFixture.bed_id,
      ),
    ).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it.each([
  ['allocation_conflict', 'conflict'],
  ['active_student_required', 'ineligible'],
])('distinguishes %s', async (error, kind) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error }), { status: 409 }),
  );
  await expect(
    changeAllocation(
      'assign',
      id,
      user.uid,
      signal(),
      undefined,
      newAllocationFixture.bed_id,
    ),
  ).rejects.toMatchObject({ kind });
});
it('rejects invalid IDs and pagination before requesting credentials', async () => {
  await expect(
    listAllocations('invalid', user.uid, signal()),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    listAllocations(id, user.uid, signal(), -1),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    changeAllocation('assign', id, user.uid, signal(), undefined, 'bad'),
  ).rejects.toMatchObject({ kind: 'invalid' });
  await expect(
    changeAllocation(
      'transfer',
      id,
      user.uid,
      signal(),
      'bad',
      newAllocationFixture.bed_id,
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects mismatched students, invalid dates, inconsistent active counts and ended active rows', async () => {
  for (const page of [
    null,
    {},
    allocationPage([
      { ...allocationFixture, student_id: studentFixture.user_id },
    ]),
    allocationPage([{ ...allocationFixture, started_at: 'invalid' }]),
    allocationPage([], 0, 1),
    allocationPage([allocationFixture], 0, 2),
    allocationPage([
      { ...allocationFixture, ended_at: '2026-10-02T00:00:00Z' },
    ]),
  ]) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page)));
    await expect(
      listAllocations(id, user.uid, signal(), 0, true),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('accepts ended legacy records with nullable audit fields', async () => {
  const item = {
    ...allocationFixture,
    ended_at: '2026-10-02T00:00:00Z',
    started_by: null,
  };
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(allocationPage([item]))),
  );
  await expect(listAllocations(id, user.uid, signal())).resolves.toMatchObject({
    items: [item],
  });
});
it('rejects malformed mutation acknowledgements rather than claiming success', async () => {
  for (const row of [
    {},
    { ...newAllocationFixture, student_id: studentFixture.user_id },
    allocationFixture,
  ]) {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(row), { status: 201 }),
    );
    await expect(
      changeAllocation(
        'assign',
        id,
        user.uid,
        signal(),
        undefined,
        newAllocationFixture.bed_id,
      ),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(newAllocationFixture), { status: 200 }),
  );
  await expect(
    changeAllocation(
      'assign',
      id,
      user.uid,
      signal(),
      undefined,
      newAllocationFixture.bed_id,
    ),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects switched identities without sending another module a token for the wrong staff user', async () => {
  await expect(listAllocations(id, 'other', signal())).rejects.toMatchObject({
    kind: 'session',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
