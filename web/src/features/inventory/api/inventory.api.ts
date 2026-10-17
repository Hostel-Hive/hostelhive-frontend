import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
export interface Block {
  block_id: string;
  name: string;
}
export interface Room {
  room_id: string;
  block_id: string;
  room_no: string;
}
export interface Bed {
  bed_id: string;
  room_id: string;
  block_id: string;
  bed_no: string;
  available: boolean;
}
export interface InventoryPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export class InventoryError extends Error {
  constructor(
    public readonly kind: 'forbidden' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export async function listInventory(
  kind: 'blocks' | 'rooms' | 'beds',
  uid: string,
  signal: AbortSignal,
  offset = 0,
  parentID?: string,
): Promise<InventoryPage<Block | Room | Bed>> {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (kind !== 'blocks' && !uuid(parentID))
  )
    throw new InventoryError('unavailable', 'Choose a valid inventory filter.');
  const query = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (kind === 'rooms') query.set('block_id', parentID!);
  if (kind === 'beds') {
    query.set('room_id', parentID!);
    query.set('available', 'true');
  }
  const response = await authorizedRequest(
    `/api/v1/${kind}?${query}`,
    uid,
    signal,
  );
  if (response.status === 401)
    throw new AuthorizedRequestError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new InventoryError(
      'forbidden',
      'You do not have permission to select beds.',
    );
  if (!response.ok)
    throw new InventoryError(
      'unavailable',
      'Inventory unavailable. Please try again.',
    );
  const page = (await response.json()) as InventoryPage<Block | Room | Bed>;
  const valid = (item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    if (kind === 'blocks')
      return uuid(row.block_id) && typeof row.name === 'string';
    if (kind === 'rooms')
      return (
        uuid(row.room_id) &&
        row.block_id === parentID &&
        typeof row.room_no === 'string'
      );
    return (
      uuid(row.bed_id) &&
      row.room_id === parentID &&
      uuid(row.block_id) &&
      typeof row.bed_no === 'string' &&
      row.available === true
    );
  };
  if (
    !page ||
    !Array.isArray(page.items) ||
    !page.items.every(valid) ||
    !Number.isSafeInteger(page.total) ||
    page.total < page.items.length ||
    page.limit !== 20 ||
    page.offset !== offset ||
    page.items.length > 20
  )
    throw new InventoryError(
      'unavailable',
      'Inventory response could not be verified.',
    );
  return page;
}
