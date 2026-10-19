import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type { InventoryPage } from './inventory.api';

export type InventoryKind = 'blocks' | 'rooms' | 'beds';
export interface InventoryRecord {
  block_id: string;
  room_id?: string;
  bed_id?: string;
  name?: string;
  room_no?: string;
  bed_no?: string;
  room_count?: number;
  capacity?: number;
  occupied_beds?: number;
  available_beds?: number;
  available?: boolean;
}
export interface InventoryFilter {
  blockID?: string;
  roomID?: string;
  available?: boolean;
  offset: number;
}
export class InventoryManagementError extends Error {
  constructor(
    public readonly kind:
      'forbidden' | 'invalid' | 'not-found' | 'conflict' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const inventoryID = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const inventoryKind = (filter: InventoryFilter): InventoryKind =>
  filter.roomID ? 'beds' : filter.blockID ? 'rooms' : 'blocks';
export const inventoryLabel = (row: InventoryRecord) =>
  row.bed_no ?? row.room_no ?? row.name ?? '';
export const inventoryRecordID = (row: InventoryRecord) =>
  row.bed_id ?? row.room_id ?? row.block_id;
export function labelError(kind: InventoryKind, value: string): string | null {
  const max = kind === 'blocks' ? 120 : 32;
  if (!value.trim()) return 'Enter a name or label.';
  if (Array.from(value.trim()).length > max)
    return `Use ${max} characters or fewer.`;
  if (/\p{Cc}/u.test(value)) return 'Control characters are not allowed.';
  return null;
}
export function parseInventoryFilter(
  params: URLSearchParams,
): InventoryFilter | null {
  const allowed = ['block_id', 'room_id', 'available', 'offset'];
  if (
    [...params.keys()].some(
      (key) => !allowed.includes(key) || params.getAll(key).length !== 1,
    )
  )
    return null;
  const blockID = params.get('block_id') ?? undefined;
  const roomID = params.get('room_id') ?? undefined;
  const available = params.get('available');
  const rawOffset = params.get('offset') ?? '0';
  const offset = Number(rawOffset);
  if (
    (blockID !== undefined && !inventoryID(blockID)) ||
    (roomID !== undefined && (!inventoryID(roomID) || !blockID)) ||
    (available !== null &&
      (!roomID || !['true', 'false'].includes(available))) ||
    !/^\d+$/.test(rawOffset) ||
    !Number.isSafeInteger(offset) ||
    offset > 100000
  )
    return null;
  return {
    blockID,
    roomID,
    available: available === null ? undefined : available === 'true',
    offset,
  };
}
function validRecord(
  value: unknown,
  kind: InventoryKind,
  filter: InventoryFilter,
): value is InventoryRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as InventoryRecord;
  if (
    !inventoryID(row.block_id) ||
    (filter.blockID && row.block_id !== filter.blockID)
  )
    return false;
  if (kind !== 'blocks' && !inventoryID(row.room_id)) return false;
  if (kind === 'beds')
    return (
      inventoryID(row.bed_id) &&
      row.room_id === filter.roomID &&
      typeof row.bed_no === 'string' &&
      !labelError(kind, row.bed_no) &&
      typeof row.available === 'boolean' &&
      (filter.available === undefined || row.available === filter.available)
    );
  const label = kind === 'blocks' ? row.name : row.room_no;
  const count = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  return (
    typeof label === 'string' &&
    !labelError(kind, label) &&
    count(row.capacity) &&
    count(row.occupied_beds) &&
    count(row.available_beds) &&
    row.capacity === row.occupied_beds! + row.available_beds! &&
    (kind !== 'blocks' || count(row.room_count))
  );
}
async function checkResponse(response: Response) {
  if (response.status === 401)
    throw new AuthorizedRequestError(
      'session',
      'Your session has expired. Sign in again.',
    );
  const errors = {
    400: [
      'invalid',
      'The inventory details are invalid. Check the label and try again.',
    ],
    403: ['forbidden', 'You do not have permission to perform this action.'],
    404: [
      'not-found',
      'This inventory item or its parent no longer exists. Refresh the inventory.',
    ],
    409: [
      'conflict',
      'This name or label already exists here. Choose another.',
    ],
  } as const;
  const error = errors[response.status as keyof typeof errors];
  if (error) throw new InventoryManagementError(error[0], error[1]);
  if (!response.ok)
    throw new InventoryManagementError(
      'unavailable',
      'Inventory is unavailable. Please try again.',
    );
}
export async function browseInventory(
  filter: InventoryFilter,
  uid: string,
  signal: AbortSignal,
): Promise<InventoryPage<InventoryRecord>> {
  const query = new URLSearchParams({
    limit: '20',
    offset: String(filter.offset),
  });
  if (filter.blockID) query.set('block_id', filter.blockID);
  if (filter.roomID) query.set('room_id', filter.roomID);
  if (filter.available !== undefined)
    query.set('available', String(filter.available));
  const kind = inventoryKind(filter);
  const response = await authorizedRequest(
    `/api/v1/${kind}?${query}`,
    uid,
    signal,
  );
  await checkResponse(response);
  const page = (await response.json()) as InventoryPage<InventoryRecord>;
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    !page.items.every((row) => validRecord(row, kind, filter)) ||
    new Set(page.items.map(inventoryRecordID)).size !== page.items.length ||
    !Number.isSafeInteger(page.total) ||
    page.total < page.items.length ||
    page.limit !== 20 ||
    page.offset !== filter.offset
  )
    throw new InventoryManagementError(
      'unavailable',
      'Inventory response could not be verified.',
    );
  return page;
}
export async function saveInventory(
  kind: InventoryKind,
  filter: InventoryFilter,
  label: string,
  uid: string,
  signal: AbortSignal,
  row?: InventoryRecord,
): Promise<InventoryRecord> {
  const error = labelError(kind, label);
  if (error) throw new InventoryManagementError('invalid', error);
  if (
    (kind !== 'blocks' && !inventoryID(filter.blockID)) ||
    (kind === 'beds' && !inventoryID(filter.roomID)) ||
    (row && !validRecord(row, kind, { ...filter, available: undefined }))
  )
    throw new InventoryManagementError(
      'invalid',
      'Choose a valid inventory item and parent.',
    );
  const field =
    kind === 'blocks' ? 'name' : kind === 'rooms' ? 'room_no' : 'bed_no';
  const body: Record<string, string> = { [field]: label.trim() };
  if (!row && kind === 'rooms') body.block_id = filter.blockID!;
  if (!row && kind === 'beds') body.room_id = filter.roomID!;
  const response = await authorizedRequest(
    `/api/v1/${kind}${row ? `/${inventoryRecordID(row)}` : ''}`,
    uid,
    signal,
    {
      method: row ? 'PUT' : 'POST',
      contentType: 'application/json',
      body: JSON.stringify(body),
    },
  );
  await checkResponse(response);
  const result: unknown = await response.json();
  if (
    response.status !== (row ? 200 : 201) ||
    !validRecord(result, kind, { ...filter, available: undefined }) ||
    inventoryLabel(result) !== label.trim() ||
    (row && inventoryRecordID(result) !== inventoryRecordID(row))
  )
    throw new InventoryManagementError(
      'unavailable',
      'The saved inventory response could not be verified.',
    );
  return result;
}
