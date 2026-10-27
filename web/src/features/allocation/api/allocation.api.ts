import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  Allocation,
  AllocationPage,
  AllocationAction,
} from '../allocation.types';
import { InventoryError } from '../../inventory/api/inventory.api';
export class AllocationError extends Error {
  constructor(
    public readonly kind:
      | 'session'
      | 'forbidden'
      | 'invalid'
      | 'not-found'
      | 'conflict'
      | 'ineligible'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable = () =>
  new AllocationError(
    'unavailable',
    'Accommodation service unavailable. Refresh before trying again.',
  );
export function allocationError(reason: unknown): AllocationError {
  if (reason instanceof AllocationError) return reason;
  if (reason instanceof AuthorizedRequestError)
    return new AllocationError(reason.kind, reason.message);
  if (reason instanceof InventoryError && reason.kind === 'forbidden')
    return new AllocationError('forbidden', reason.message);
  return unavailable();
}
function valid(value: unknown): value is Allocation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Allocation;
  const timestamp = (s: unknown) =>
    typeof s === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(s) &&
    Number.isFinite(Date.parse(s));
  return (
    uuid(row.allocation_id) &&
    uuid(row.student_id) &&
    uuid(row.bed_id) &&
    timestamp(row.started_at) &&
    (row.ended_at === null || timestamp(row.ended_at)) &&
    (row.started_by === null || uuid(row.started_by)) &&
    (row.ended_by === null || uuid(row.ended_by)) &&
    (row.end_reason === null ||
      row.end_reason === 'revoked' ||
      row.end_reason === 'checkout' ||
      row.end_reason === 'transferred') &&
    (row.ended_at !== null ||
      (row.ended_by === null && row.end_reason === null))
  );
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  input?: { body?: object },
): Promise<Response> {
  const response = await authorizedRequest(
    `/api/v1/allocations${path}`,
    uid,
    signal,
    input
      ? {
          method: 'POST',
          ...(input.body
            ? {
                body: JSON.stringify(input.body),
                contentType: 'application/json',
              }
            : {}),
        }
      : undefined,
  );
  const messages = {
    401: ['session', 'Your session has expired. Sign in again.'],
    403: ['forbidden', 'You do not have permission to manage accommodation.'],
    404: [
      'not-found',
      'The student, bed, or allocation no longer exists. Refresh accommodation.',
    ],
    400: [
      'invalid',
      'The allocation request was rejected. Refresh accommodation.',
    ],
    413: ['invalid', 'The allocation request was rejected.'],
    415: ['invalid', 'The allocation request was rejected.'],
  } as const;
  if (response.status in messages) {
    const [kind, message] = messages[response.status as keyof typeof messages];
    throw new AllocationError(kind, message);
  }
  if (response.status === 409) {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      body.error === 'active_student_required'
    )
      throw new AllocationError(
        'ineligible',
        'Only an active student account with an eligible profile can be assigned or transferred.',
      );
    throw new AllocationError(
      'conflict',
      'The bed or allocation changed. Refresh and choose an available bed again.',
    );
  }
  if (!response.ok) throw unavailable();
  return response;
}
export async function listAllocations(
  studentID: string,
  uid: string,
  signal: AbortSignal,
  offset = 0,
  activeOnly = false,
): Promise<AllocationPage> {
  if (!uuid(studentID) || !Number.isSafeInteger(offset) || offset < 0)
    throw new AllocationError('invalid', 'Invalid accommodation request.');
  const query = new URLSearchParams({
    student_id: studentID,
    limit: '10',
    offset: String(offset),
  });
  if (activeOnly) query.set('active', 'true');
  const response = await request(`?${query}`, uid, signal);
  const page = (await response.json()) as AllocationPage;
  if (
    !page ||
    !Array.isArray(page.items) ||
    !page.items.every(
      (row) =>
        valid(row) &&
        row.student_id.toLowerCase() === studentID.toLowerCase() &&
        (!activeOnly || row.ended_at === null),
    ) ||
    new Set(page.items.map((row) => row.allocation_id)).size !==
      page.items.length ||
    !Number.isSafeInteger(page.total) ||
    page.total < page.items.length ||
    page.limit !== 10 ||
    page.offset !== offset ||
    page.items.length > 10 ||
    (activeOnly && (page.total > 1 || page.items.length !== page.total))
  )
    throw unavailable();
  return page;
}
export async function changeAllocation(
  action: AllocationAction,
  studentID: string,
  uid: string,
  signal: AbortSignal,
  allocationID?: string,
  bedID?: string,
): Promise<Allocation> {
  if (
    !uuid(studentID) ||
    (action !== 'assign' && !uuid(allocationID)) ||
    (action !== 'revoke' && !uuid(bedID))
  )
    throw new AllocationError(
      'invalid',
      'Choose a valid student and bed allocation.',
    );
  const path = action === 'assign' ? '' : `/${allocationID}/${action}`;
  const response = await request(
    path,
    uid,
    signal,
    action === 'revoke'
      ? {}
      : {
          body:
            action === 'assign'
              ? { student_id: studentID, bed_id: bedID }
              : { bed_id: bedID },
        },
  );
  const row: unknown = await response.json();
  if (
    response.status !== (action === 'assign' ? 201 : 200) ||
    !valid(row) ||
    row.student_id.toLowerCase() !== studentID.toLowerCase() ||
    (action === 'revoke'
      ? row.allocation_id !== allocationID ||
        row.ended_at === null ||
        row.end_reason !== 'revoked'
      : row.bed_id !== bedID ||
        row.ended_at !== null ||
        (action === 'transfer' && row.allocation_id === allocationID))
  )
    throw unavailable();
  return row;
}
