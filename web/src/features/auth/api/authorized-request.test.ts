import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from './auth.api';
import { authorizedRequest } from './authorized-request';
vi.mock('./auth.api', () => ({ configuredAuth: vi.fn() }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response('{}'));
  vi.mocked(configuredAuth).mockReturnValue({
    authStateReady: async () => {},
    currentUser: { uid: 'admin', getIdToken: async () => 'test-token' },
  } as unknown as ReturnType<typeof configuredAuth>);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it('forwards an operation key while retaining protected request headers and cache policy', async () => {
  await authorizedRequest(
    '/api/v1/users',
    'admin',
    new AbortController().signal,
    {
      method: 'POST',
      contentType: 'application/json',
      idempotencyKey: 'original-key-83',
      body: '{}',
    },
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/users'),
    expect.objectContaining({
      method: 'POST',
      body: '{}',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'original-key-83',
      },
      cache: 'no-store',
      credentials: 'omit',
    }),
  );
});
it('omits an operation key on ordinary reads', async () => {
  await authorizedRequest(
    '/api/v1/staff',
    'admin',
    new AbortController().signal,
  );
  expect(fetchMock.mock.calls[0][1].headers).toEqual({
    Authorization: 'Bearer test-token',
  });
});
