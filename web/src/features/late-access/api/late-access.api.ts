import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  LateAccessDecision,
  LateAccessPage,
  LateAccessRequest,
} from '../late-access.types';

export class LateAccessError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'not-found'
      | 'conflict'
      | 'ineligible'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const lateAccessUUID = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const lateAccessStatuses = ['pending', 'approved', 'rejected'] as const;
export function decisionNoteError(
  status: LateAccessDecision,
  note: string,
): string | null {
  if (status === 'rejected' && !note.trim())
    return 'Enter a reason for rejecting this request.';
  if (Array.from(note.trim()).length > 1000)
    return 'Use 1000 characters or fewer.';
  if (/[\p{Cc}]/u.test(note.replace(/[\n\r\t]/g, '')))
    return 'Remove unsupported control characters.';
  return null;
}
export function lateAccessFilters(params: URLSearchParams): URLSearchParams {
  const output = new URLSearchParams({ limit: '20', offset: '0' });
  for (const [key, value] of params) {
    if (
      !['status', 'student_id', 'offset'].includes(key) ||
      params.getAll(key).length !== 1 ||
      !value
    )
      throw new LateAccessError(
        'invalid',
        'Invalid access filters. Clear filters and try again.',
      );
    if (
      (key === 'status' &&
        !lateAccessStatuses.includes(
          value as (typeof lateAccessStatuses)[number],
        )) ||
      (key === 'student_id' && !lateAccessUUID(value)) ||
      (key === 'offset' &&
        (!/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) > Number.MAX_SAFE_INTEGER - 20))
    )
      throw new LateAccessError(
        'invalid',
        'Use a valid status, student UUID and page offset.',
      );
    output.set(key, key === 'student_id' ? value.toLowerCase() : value);
  }
  return output;
}
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
export function validLateAccess(value: unknown): value is LateAccessRequest {
  if (!value || typeof value !== 'object') return false;
  const row = value as LateAccessRequest;
  return (
    lateAccessUUID(row.late_access_id) &&
    lateAccessUUID(row.request_id) &&
    lateAccessUUID(row.student_id) &&
    lateAccessUUID(row.submitted_by) &&
    (row.direction === 'IN' || row.direction === 'OUT') &&
    timestamp(row.expected_at) &&
    (row.consumed_at === undefined
      ? row.consumed_device_id === undefined &&
        row.consumed_event_id === undefined
      : row.status === 'approved' &&
        timestamp(row.consumed_at) &&
        lateAccessUUID(row.consumed_device_id) &&
        lateAccessUUID(row.consumed_event_id)) &&
    timestamp(row.created_at) &&
    typeof row.reason === 'string' &&
    Boolean(row.reason.trim()) &&
    Array.from(row.reason).length <= 1000 &&
    lateAccessStatuses.includes(row.status) &&
    typeof row.decision_note === 'string' &&
    (row.status === 'pending'
      ? row.decided_at === null &&
        row.decided_by === null &&
        row.decision_note === ''
      : timestamp(row.decided_at) &&
        lateAccessUUID(row.decided_by) &&
        !decisionNoteError(row.status, row.decision_note))
  );
}
export function lateAccessError(error: unknown): LateAccessError {
  if (error instanceof LateAccessError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new LateAccessError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new LateAccessError(
    'unavailable',
    'Access requests are unavailable. Please try again.',
  );
}
async function responseJSON(response: Response): Promise<unknown> {
  if (!response.ok) {
    const messages = {
      400: [
        'invalid',
        'The request is invalid. Check the details and try again.',
      ],
      401: ['session', 'Your session has expired. Sign in again.'],
      403: [
        'forbidden',
        'Access denied. Your account cannot manage access requests.',
      ],
      404: ['not-found', 'This access request could not be found.'],
      409: [
        'conflict',
        'This request changed or can no longer be approved. Check its current status.',
      ],
    } as const;
    if (response.status === 409) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      if (
        body?.error?.code === 'active_student_required' ||
        body?.error === 'active_student_required'
      )
        throw new LateAccessError(
          'ineligible',
          'Approval requires an active, eligible student. Recheck this request; it may still be rejected.',
        );
    }
    const error = messages[response.status as keyof typeof messages];
    if (error) throw new LateAccessError(error[0], error[1]);
    throw new LateAccessError(
      'unavailable',
      'The service could not confirm this request.',
    );
  }
  return response.json();
}
export async function listLateAccessRequests(
  params: URLSearchParams,
  uid: string,
  signal: AbortSignal,
): Promise<LateAccessPage> {
  const query = lateAccessFilters(params);
  const page = (await responseJSON(
    await authorizedRequest(
      `/api/v1/late-access-requests?${query}`,
      uid,
      signal,
    ),
  )) as LateAccessPage;
  const offset = Number(query.get('offset'));
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    !page.items.every(validLateAccess) ||
    new Set(page.items.map((row) => row.late_access_id)).size !==
      page.items.length ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0 ||
    page.total < (page.items.length ? offset + page.items.length : 0) ||
    page.limit !== 20 ||
    page.offset !== offset ||
    page.has_more !== offset + page.items.length < page.total ||
    page.items.some(
      (row) =>
        (query.has('student_id') &&
          row.student_id !== query.get('student_id')) ||
        (query.has('status') && row.status !== query.get('status')),
    )
  )
    throw new LateAccessError(
      'unavailable',
      'The access listing could not be verified.',
    );
  return page;
}
export async function getLateAccess(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<LateAccessRequest> {
  if (!lateAccessUUID(id))
    throw new LateAccessError('invalid', 'Choose a valid access request.');
  const row = await responseJSON(
    await authorizedRequest(
      `/api/v1/late-access-requests/${id.toLowerCase()}`,
      uid,
      signal,
    ),
  );
  if (!validLateAccess(row) || row.late_access_id !== id.toLowerCase())
    throw new LateAccessError(
      'unavailable',
      'The access request could not be verified.',
    );
  return row;
}
export async function decideLateAccess(
  row: LateAccessRequest,
  status: LateAccessDecision,
  note: string,
  uid: string,
  signal: AbortSignal,
): Promise<LateAccessRequest> {
  const error = decisionNoteError(status, note);
  if (
    !validLateAccess(row) ||
    row.status !== 'pending' ||
    !['approved', 'rejected'].includes(status) ||
    error
  )
    throw new LateAccessError(
      'invalid',
      error ?? 'Only pending requests can be decided.',
    );
  const result = await responseJSON(
    await authorizedRequest(
      `/api/v1/late-access-requests/${row.late_access_id}/decision`,
      uid,
      signal,
      {
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ status, note: note.trim() }),
      },
    ),
  );
  if (
    !validLateAccess(result) ||
    result.late_access_id !== row.late_access_id ||
    result.student_id !== row.student_id ||
    result.status !== status ||
    result.decision_note !== note.trim() ||
    result.direction !== row.direction ||
    result.expected_at !== row.expected_at
  )
    throw new LateAccessError(
      'unavailable',
      'The decision response could not be verified.',
    );
  return result;
}
