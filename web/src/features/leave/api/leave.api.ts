import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type { LeaveDecision, LeavePage, LeaveRequest } from '../leave.types';

export class LeaveError extends Error {
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
export const leaveUUID = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const leaveStatuses = ['pending', 'approved', 'rejected'] as const;
export function decisionNoteError(
  status: LeaveDecision,
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
export function leaveFilters(params: URLSearchParams): URLSearchParams {
  const output = new URLSearchParams({ limit: '20', offset: '0' });
  for (const [key, value] of params) {
    if (
      !['status', 'student_id', 'offset'].includes(key) ||
      params.getAll(key).length !== 1 ||
      !value
    )
      throw new LeaveError(
        'invalid',
        'Invalid leave filters. Clear filters and try again.',
      );
    if (
      (key === 'status' &&
        !leaveStatuses.includes(value as (typeof leaveStatuses)[number])) ||
      (key === 'student_id' && !leaveUUID(value)) ||
      (key === 'offset' &&
        (!/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) > Number.MAX_SAFE_INTEGER - 20))
    )
      throw new LeaveError(
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
export function validLeave(value: unknown): value is LeaveRequest {
  if (!value || typeof value !== 'object') return false;
  const row = value as LeaveRequest;
  return (
    leaveUUID(row.leave_id) &&
    leaveUUID(row.request_id) &&
    leaveUUID(row.student_id) &&
    leaveUUID(row.submitted_by) &&
    timestamp(row.starts_at) &&
    timestamp(row.ends_at) &&
    Date.parse(row.ends_at) > Date.parse(row.starts_at) &&
    timestamp(row.created_at) &&
    typeof row.reason === 'string' &&
    Boolean(row.reason.trim()) &&
    Array.from(row.reason).length <= 1000 &&
    leaveStatuses.includes(row.status) &&
    typeof row.decision_note === 'string' &&
    (row.status === 'pending'
      ? row.decided_at === null &&
        row.decided_by === null &&
        row.decision_note === ''
      : timestamp(row.decided_at) &&
        leaveUUID(row.decided_by) &&
        !decisionNoteError(row.status, row.decision_note))
  );
}
export function leaveError(error: unknown): LeaveError {
  if (error instanceof LeaveError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new LeaveError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new LeaveError(
    'unavailable',
    'Leave requests are unavailable. Please try again.',
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
        'Access denied. Your account cannot manage leave requests.',
      ],
      404: ['not-found', 'This leave request could not be found.'],
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
        throw new LeaveError(
          'ineligible',
          'Approval requires an active, eligible student. Recheck this request; it may still be rejected.',
        );
    }
    const error = messages[response.status as keyof typeof messages];
    if (error) throw new LeaveError(error[0], error[1]);
    throw new LeaveError(
      'unavailable',
      'The service could not confirm this request.',
    );
  }
  return response.json();
}
export async function listLeaves(
  params: URLSearchParams,
  uid: string,
  signal: AbortSignal,
): Promise<LeavePage> {
  const query = leaveFilters(params);
  const page = (await responseJSON(
    await authorizedRequest(`/api/v1/leaves?${query}`, uid, signal),
  )) as LeavePage;
  const offset = Number(query.get('offset'));
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    !page.items.every(validLeave) ||
    new Set(page.items.map((row) => row.leave_id)).size !== page.items.length ||
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
    throw new LeaveError(
      'unavailable',
      'The leave listing could not be verified.',
    );
  return page;
}
export async function getLeave(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<LeaveRequest> {
  if (!leaveUUID(id))
    throw new LeaveError('invalid', 'Choose a valid leave request.');
  const row = await responseJSON(
    await authorizedRequest(`/api/v1/leaves/${id.toLowerCase()}`, uid, signal),
  );
  if (!validLeave(row) || row.leave_id !== id.toLowerCase())
    throw new LeaveError(
      'unavailable',
      'The leave request could not be verified.',
    );
  return row;
}
export async function decideLeave(
  row: LeaveRequest,
  status: LeaveDecision,
  note: string,
  uid: string,
  signal: AbortSignal,
): Promise<LeaveRequest> {
  const error = decisionNoteError(status, note);
  if (
    !validLeave(row) ||
    row.status !== 'pending' ||
    !['approved', 'rejected'].includes(status) ||
    error
  )
    throw new LeaveError(
      'invalid',
      error ?? 'Only pending requests can be decided.',
    );
  const result = await responseJSON(
    await authorizedRequest(
      `/api/v1/leaves/${row.leave_id}/decision`,
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
    !validLeave(result) ||
    result.leave_id !== row.leave_id ||
    result.student_id !== row.student_id ||
    result.status !== status ||
    result.decision_note !== note.trim() ||
    result.starts_at !== row.starts_at ||
    result.ends_at !== row.ends_at
  )
    throw new LeaveError(
      'unavailable',
      'The decision response could not be verified.',
    );
  return result;
}
