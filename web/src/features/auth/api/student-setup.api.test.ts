import { beforeEach, expect, it, vi } from 'vitest';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from './authorized-request';
import { completeStudentSetup } from './student-setup.api';
vi.mock('./authorized-request', async (original) => ({
  ...(await original<typeof import('./authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
it('posts no body and requires a verified completion response', async () => {
  const signal = new AbortController().signal;
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(
      JSON.stringify({
        setup_required: false,
        setup_completed_at: '2026-10-20T08:00:00Z',
      }),
    ),
  );
  await completeStudentSetup('student-uid', signal);
  expect(authorizedRequest).toHaveBeenCalledWith(
    '/api/v1/me/setup/complete',
    'student-uid',
    signal,
    { method: 'POST' },
  );
});
it('accepts legacy completion with no invitation timestamp', async () => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(
      JSON.stringify({ setup_required: false, setup_completed_at: null }),
    ),
  );
  await expect(
    completeStudentSetup('uid', new AbortController().signal),
  ).resolves.toBeUndefined();
});
it.each([401, 403, 409, 503])(
  'handles status %s without claiming completion',
  async (status) => {
    vi.mocked(authorizedRequest).mockResolvedValue(
      new Response('{}', { status }),
    );
    await expect(
      completeStudentSetup('uid', new AbortController().signal),
    ).rejects.toMatchObject({
      kind:
        status === 409 ? 'pending' : status === 503 ? 'unavailable' : 'session',
    });
  },
);
it.each([
  {},
  null,
  { setup_required: true, setup_completed_at: null },
  { setup_required: false, setup_completed_at: 'bad' },
])('rejects incomplete or malformed completion %#', async (result) => {
  vi.mocked(authorizedRequest).mockResolvedValue(
    new Response(JSON.stringify(result)),
  );
  await expect(
    completeStudentSetup('uid', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('handles expired credentials and network failures', async () => {
  vi.mocked(authorizedRequest)
    .mockRejectedValueOnce(
      new AuthorizedRequestError('session', 'Sign in again.'),
    )
    .mockRejectedValueOnce(new Error('private network details'));
  await expect(
    completeStudentSetup('uid', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'session' });
  await expect(
    completeStudentSetup('uid', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
