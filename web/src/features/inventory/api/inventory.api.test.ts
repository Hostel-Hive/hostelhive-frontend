import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { configuredAuth } from '../../auth/api/auth.api';
import { listInventory } from './inventory.api';
import {
  blockFixture,
  roomFixture,
  bedFixture,
} from '../../../test/fixtures/allocation';
vi.mock('../../auth/api/auth.api', () => ({ configuredAuth: vi.fn() }));
const user = { uid: 'staff', getIdToken: vi.fn() };
const auth = { currentUser: user, authStateReady: vi.fn() };
const fetchMock = vi.fn();
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('fetch', fetchMock);
  user.getIdToken.mockResolvedValue('private-token');
  vi.mocked(configuredAuth).mockReturnValue(
    auth as unknown as NonNullable<ReturnType<typeof configuredAuth>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each([
  ['blocks', undefined, blockFixture, ''],
  [
    'rooms',
    blockFixture.block_id,
    roomFixture,
    `&block_id=${blockFixture.block_id}`,
  ],
  [
    'beds',
    roomFixture.room_id,
    bedFixture,
    `&room_id=${roomFixture.room_id}&available=true`,
  ],
] as const)(
  'reads paginated %s using verified authorization',
  async (kind, parent, item, query) => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ items: [item], total: 21, limit: 20, offset: 20 }),
      ),
    );
    await expect(
      listInventory(kind, user.uid, signal(), 20, parent),
    ).resolves.toMatchObject({ items: [item] });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/backend-api/api/v1/${kind}?limit=20&offset=20${query}`,
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer private-token',
    );
  },
);
it.each([
  [401, 'session'],
  [403, 'forbidden'],
  [503, 'unavailable'],
])('handles inventory HTTP %s', async (status, kind) => {
  fetchMock.mockResolvedValue(new Response('{}', { status: Number(status) }));
  await expect(
    listInventory('blocks', user.uid, signal()),
  ).rejects.toMatchObject({ kind });
});
it('rejects malformed, occupied and wrong-room bed results', async () => {
  for (const item of [
    {},
    { ...bedFixture, available: false },
    { ...bedFixture, room_id: blockFixture.block_id },
  ]) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ items: [item], total: 1, limit: 20, offset: 0 }),
      ),
    );
    await expect(
      listInventory('beds', user.uid, signal(), 0, roomFixture.room_id),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  }
});
it('rejects invalid filters without sending a request', async () => {
  await expect(
    listInventory('rooms', user.uid, signal(), 0, 'bad'),
  ).rejects.toThrow('valid inventory');
  await expect(listInventory('blocks', user.uid, signal(), -1)).rejects.toThrow(
    'valid inventory',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
