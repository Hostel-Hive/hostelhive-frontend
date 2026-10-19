import { beforeEach, expect, it, vi } from 'vitest';
import { authorizedRequest } from '../../auth/api/authorized-request';
import {
  browseInventory,
  saveInventory,
  labelError,
  parseInventoryFilter,
  inventoryRecordID,
  type InventoryFilter,
  type InventoryKind,
} from './inventory-management.api';
import {
  inventoryBlock as block,
  inventoryRoom as room,
  inventoryBed as bed,
  inventoryPage,
} from '../../../test/fixtures/inventory';
vi.mock('../../auth/api/authorized-request', async (original) => ({
  ...(await original<typeof import('../../auth/api/authorized-request')>()),
  authorizedRequest: vi.fn(),
}));
const request = vi.mocked(authorizedRequest);
const signal = () => new AbortController().signal;
const filters: InventoryFilter[] = [
  { offset: 0 },
  { offset: 0, blockID: block.block_id },
  { offset: 0, blockID: block.block_id, roomID: room.room_id },
];
beforeEach(() => vi.resetAllMocks());
it.each([
  ['blocks', block, filters[0], { name: 'New' }],
  ['rooms', room, filters[1], { room_no: 'New', block_id: block.block_id }],
  ['beds', bed, filters[2], { bed_no: 'New', room_id: room.room_id }],
] as const)(
  'creates and renames %s using only supported fields',
  async (kind, row, filter, body) => {
    const field =
      kind === 'blocks' ? 'name' : kind === 'rooms' ? 'room_no' : 'bed_no';
    const saved = { ...row, [field]: 'New' };
    request
      .mockResolvedValueOnce(Response.json(saved, { status: 201 }))
      .mockResolvedValueOnce(Response.json(saved));
    await expect(
      saveInventory(kind, filter, ' New ', 'staff', signal()),
    ).resolves.toEqual(saved);
    expect(request.mock.calls[0][0]).toBe(`/api/v1/${kind}`);
    expect(request.mock.calls[0][3]).toEqual({
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    await saveInventory(kind, filter, ' New ', 'staff', signal(), row);
    expect(request.mock.calls[1][0]).toBe(
      `/api/v1/${kind}/${inventoryRecordID(row)}`,
    );
    expect(request.mock.calls[1][3]).toEqual({
      method: 'PUT',
      contentType: 'application/json',
      body: JSON.stringify({ [field]: 'New' }),
    });
  },
);
it.each([
  [filters[0], block, 'blocks?limit=20&offset=0'],
  [filters[1], room, `rooms?limit=20&offset=0&block_id=${block.block_id}`],
  [
    filters[2],
    bed,
    `beds?limit=20&offset=0&block_id=${block.block_id}&room_id=${room.room_id}`,
  ],
  [
    { ...filters[2], available: false, offset: 20 },
    { ...bed, available: false },
    `beds?limit=20&offset=20&block_id=${block.block_id}&room_id=${room.room_id}&available=false`,
  ],
] as const)(
  'reads the selected hierarchy with filters %#',
  async (filter, row, path) => {
    request.mockResolvedValue(
      Response.json(inventoryPage([row], filter.offset, 21)),
    );
    await expect(
      browseInventory(filter, 'staff', signal()),
    ).resolves.toMatchObject({ items: [row] });
    expect(request.mock.calls[0].slice(0, 2)).toEqual([
      `/api/v1/${path}`,
      'staff',
    ]);
  },
);
it.each([
  [400, 'invalid'],
  [401, 'session'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [409, 'conflict'],
  [503, 'unavailable'],
  [415, 'unavailable'],
])('maps HTTP %s without retry', async (status, kind) => {
  request.mockResolvedValue(new Response('{}', { status: Number(status) }));
  await expect(
    saveInventory('blocks', filters[0], 'North', 'staff', signal()),
  ).rejects.toMatchObject({ kind });
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([
  'q=bad',
  'offset=-1',
  'offset=100001',
  'offset=1.2',
  'block_id=bad',
  `room_id=${room.room_id}`,
  'available=true',
  `block_id=${block.block_id}&block_id=${block.block_id}`,
  `block_id=${block.block_id}&room_id=${room.room_id}&available=maybe`,
])('rejects invalid URL filters %s', (query) => {
  expect(parseInventoryFilter(new URLSearchParams(query))).toBeNull();
});
it('restores valid direct filters including the maximum offset', () => {
  expect(
    parseInventoryFilter(
      new URLSearchParams(
        `block_id=${block.block_id}&room_id=${room.room_id}&available=true&offset=100000`,
      ),
    ),
  ).toEqual({ ...filters[2], available: true, offset: 100000 });
});
it.each([
  ['blocks', '', 'Enter'],
  ['blocks', 'a'.repeat(121), '120'],
  ['rooms', 'a'.repeat(33), '32'],
  ['beds', 'a\nb', 'Control'],
] as const)('validates %s label limits %#', (kind, value, message) => {
  expect(labelError(kind, value)).toContain(message);
});
it('uses Unicode code points for label length', () =>
  expect(labelError('beds', '🛏'.repeat(32))).toBeNull());
it.each([
  { ...block, capacity: 9 },
  { ...block, room_count: -1 },
  { ...block, occupied_beds: null },
  { ...block, block_id: 'bad' },
])('rejects unverified occupancy and identities %#', async (row) => {
  request.mockResolvedValue(
    Response.json(inventoryPage([row as typeof block])),
  );
  await expect(
    browseInventory(filters[0], 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it.each([
  { ...inventoryPage(), limit: 100 },
  { ...inventoryPage(), offset: 20 },
  { ...inventoryPage(), total: -1 },
  inventoryPage([block, block]),
  { ...inventoryPage(), items: null },
])('rejects inconsistent pagination %#', async (page) => {
  request.mockResolvedValue(Response.json(page));
  await expect(
    browseInventory(filters[0], 'staff', signal()),
  ).rejects.toMatchObject({ kind: 'unavailable' });
});
it('rejects mismatched parents, availability and mutation acknowledgements', async () => {
  request
    .mockResolvedValueOnce(
      Response.json(inventoryPage([{ ...bed, room_id: block.block_id }])),
    )
    .mockResolvedValueOnce(Response.json(inventoryPage([bed])))
    .mockResolvedValueOnce(
      Response.json({ ...block, name: 'Wrong' }, { status: 201 }),
    );
  await expect(
    browseInventory(filters[2], 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    browseInventory({ ...filters[2], available: false }, 'staff', signal()),
  ).rejects.toThrow();
  await expect(
    saveInventory('blocks', filters[0], 'New', 'staff', signal()),
  ).rejects.toThrow();
});
it.each([
  ['rooms', filters[0], 'New'],
  ['beds', filters[1], 'New'],
  ['blocks', filters[0], ' '],
] as [InventoryKind, InventoryFilter, string][])(
  'rejects invalid mutations before sending %#',
  async (kind, filter, label) => {
    await expect(
      saveInventory(kind, filter, label, 'staff', signal()),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(request).not.toHaveBeenCalled();
  },
);
