import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { checkoutStudent } from './student-checkout.api';
import {
  checkoutInputFixture,
  checkoutResultFixture,
} from '../../../test/fixtures/student-checkout';
import { studentFixture } from '../../../test/fixtures/student';

vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'admin-uid', getIdToken: vi.fn() };
const auth = {
  currentUser: user as typeof user | null,
  authStateReady: vi.fn(),
};
const fetchMock = vi.fn();
const signal = () => new AbortController().signal;
const request = () =>
  checkoutStudent(
    studentFixture.student_id,
    studentFixture.user_id,
    user.uid,
    checkoutInputFixture,
    signal(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  auth.currentUser = user;
  user.getIdToken.mockResolvedValue('private-token');
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(checkoutResultFixture())),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('sends the explicit confirmed choice and operation UUID using authenticated raw JSON', async () => {
  await expect(request()).resolves.toEqual(checkoutResultFixture());
  expect(fetchMock).toHaveBeenCalledWith(
    `/backend-api/api/v1/students/${studentFixture.student_id}/checkout`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(checkoutInputFixture),
      headers: {
        Authorization: 'Bearer private-token',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      credentials: 'omit',
    }),
  );
});
it('accepts exact replays, no-bed checkouts and inactive account snapshots', async () => {
  const result = checkoutResultFixture();
  result.replayed = true;
  result.checkout.released_allocation_id = null;
  result.checkout.released_bed_id = null;
  fetchMock.mockResolvedValue(new Response(JSON.stringify(result)));
  await expect(request()).resolves.toEqual(result);
});
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [400, 'invalid'],
  [415, 'invalid'],
  [503, 'unavailable'],
] as const)(
  'handles HTTP %s without silently retrying',
  async (status, kind) => {
    fetchMock.mockResolvedValue(
      new Response('private server details', { status }),
    );
    await expect(request()).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it.each([
  ['checkout_conflict', 'conflict'],
  ['student_already_checked_out', 'already-ended'],
  ['student_account_required', 'account'],
] as const)('handles %s with clear recovery', async (error, kind) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error }), { status: 409 }),
  );
  await expect(request()).rejects.toMatchObject({ kind });
});
it('rejects malformed or mismatched snapshots instead of claiming success', async () => {
  const original = checkoutResultFixture();
  for (const invalid of [
    {},
    { ...original, replayed: 'yes' },
    ...[
      { request_id: '99999999-9999-4999-8999-999999999999' },
      { student_id: '99999999-9999-4999-8999-999999999999' },
      { user_id: '99999999-9999-4999-8999-999999999999' },
      { reason: 'withdrawn' },
      { notes: 'different' },
      { account_active_after: true },
      { released_allocation_id: null },
      { performed_at: 'bad' },
      { performed_by: 'bad' },
    ].map((change) => ({
      ...original,
      checkout: { ...original.checkout, ...change },
    })),
  ]) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(invalid)));
    await expect(request()).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('rejects invalid input and changed sessions before submission', async () => {
  await expect(
    checkoutStudent(
      'bad',
      studentFixture.user_id,
      user.uid,
      checkoutInputFixture,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'invalid' });
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(
    checkoutStudent(
      studentFixture.student_id,
      studentFixture.user_id,
      'different-actor',
      checkoutInputFixture,
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'session' });
  expect(fetchMock).not.toHaveBeenCalled();
});
