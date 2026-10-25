import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  leaveStatuses,
  leaveUUID,
  validLeave,
} from '../../leave/api/leave.api';
import type { LeaveRequest, LeaveStatus } from '../../leave/leave.types';
import { StudentPortalError } from './student-portal.api';

export type OwnLeave = Pick<
  LeaveRequest,
  | 'leave_id'
  | 'request_id'
  | 'starts_at'
  | 'ends_at'
  | 'reason'
  | 'status'
  | 'created_at'
  | 'decided_at'
  | 'decision_note'
  | 'cancelled_at'
  | 'cancelled_by'
>;
export interface OwnLeavePage {
  items: OwnLeave[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}
export interface LeaveDraft {
  start: string;
  end: string;
  reason: string;
}
export interface LeaveSubmission {
  request_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}
export class OwnLeaveError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'setup'
      | 'not-found'
      | 'conflict'
      | 'ineligible'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function ownLeaveError(reason: unknown): OwnLeaveError {
  if (reason instanceof OwnLeaveError) return reason;
  if (reason instanceof AuthorizedRequestError && reason.kind === 'session')
    return new OwnLeaveError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new OwnLeaveError(
    'unavailable',
    'Unable to confirm the leave request. Please try again.',
  );
}
export function leaveAccessError(
  error: OwnLeaveError,
): StudentPortalError | null {
  if (
    error.kind === 'session' ||
    error.kind === 'forbidden' ||
    error.kind === 'setup'
  )
    return new StudentPortalError(error.kind, error.message);
  return null;
}
function localDate(value: string): Date | null {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ||
    value < '0001-01-01T00:00' ||
    value > '9999-12-31T23:59'
  )
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (n: number, length = 2) => String(n).padStart(length, '0');
  const roundTrip = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return roundTrip === value &&
    date.getUTCFullYear() >= 1 &&
    date.getUTCFullYear() <= 9999
    ? date
    : null;
}
function reasonError(reason: string) {
  if (!reason.trim()) return 'Enter a reason for your leave request.';
  if (Array.from(reason.trim()).length > 1000)
    return 'Use 1000 characters or fewer for your reason.';
  if (/[\p{Cc}]/u.test(reason.replace(/[\n\r\t]/g, '')))
    return 'Remove unsupported control characters from your reason.';
  return '';
}
export function validateLeaveDraft(
  draft: LeaveDraft,
  now = Date.now(),
): string {
  const start = localDate(draft.start);
  const end = localDate(draft.end);
  if (!start || !end) return 'Enter valid start and end dates and times.';
  if (start.getTime() <= now) return 'Leave must start in the future.';
  if (end.getTime() <= start.getTime())
    return 'End date and time must be after the start.';
  return reasonError(draft.reason);
}
export function prepareLeaveSubmission(
  draft: LeaveDraft,
  requestID: string,
): LeaveSubmission {
  const invalid = validateLeaveDraft(draft);
  if (invalid || !leaveUUID(requestID))
    throw new OwnLeaveError(
      'invalid',
      invalid || 'Unable to prepare a request. Reload and try again.',
    );
  return {
    request_id: requestID.toLowerCase(),
    starts_at: localDate(draft.start)!.toISOString(),
    ends_at: localDate(draft.end)!.toISOString(),
    reason: draft.reason.trim(),
  };
}
const plain = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
async function json(response: Response, expected: number): Promise<unknown> {
  if (response.status === expected) return response.json();
  const body: unknown = await response.json().catch(() => null);
  const code = plain(body)
    ? typeof body.error === 'string'
      ? body.error
      : plain(body.error)
        ? body.error.code
        : undefined
    : undefined;
  if (response.status === 401)
    throw new OwnLeaveError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new OwnLeaveError(
      code === 'setup_required' ? 'setup' : 'forbidden',
      code === 'setup_required'
        ? 'Complete your student account setup before requesting leave.'
        : 'Your account no longer has access to these leave requests.',
    );
  if (response.status === 404)
    throw new OwnLeaveError(
      'not-found',
      'This leave request is unavailable or does not belong to your account.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new OwnLeaveError(
      'invalid',
      'Check your dates and reason. The start must still be in the future and the end later than the start.',
    );
  if (response.status === 409)
    throw new OwnLeaveError(
      code === 'active_student_required' ? 'ineligible' : 'conflict',
      code === 'active_student_required'
        ? 'An active student profile is required to request leave. Contact your hostel administrator.'
        : 'This leave conflicts with a pending or approved request, or its submission details changed. Review your existing requests.',
    );
  throw ownLeaveError(null);
}
function ownRow(value: unknown, studentID: string): OwnLeave {
  if (!validLeave(value) || value.student_id !== studentID.toLowerCase())
    throw ownLeaveError(null);
  const {
    leave_id,
    request_id,
    starts_at,
    ends_at,
    reason,
    status,
    created_at,
    decided_at,
    decision_note,
  } = value;
  return {
    leave_id,
    ...(value.status === 'cancelled'
      ? { cancelled_at: value.cancelled_at, cancelled_by: value.cancelled_by }
      : {}),
    request_id,
    starts_at,
    ends_at,
    reason,
    status,
    created_at,
    decided_at,
    decision_note,
  };
}
export async function listOwnLeaves(
  uid: string,
  studentID: string,
  signal: AbortSignal,
  status: LeaveStatus | '' = '',
  offset = 0,
): Promise<OwnLeavePage> {
  try {
    if (
      !leaveUUID(studentID) ||
      (status && !leaveStatuses.includes(status)) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > Number.MAX_SAFE_INTEGER - 20
    )
      throw new OwnLeaveError('invalid', 'Choose a valid status and page.');
    const query = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (status) query.set('status', status);
    const body = await json(
      await authorizedRequest(`/api/v1/leaves?${query}`, uid, signal),
      200,
    );
    if (
      !plain(body) ||
      !Array.isArray(body.items) ||
      !Number.isSafeInteger(body.total) ||
      (body.total as number) < 0 ||
      body.limit !== 20 ||
      body.offset !== offset ||
      body.items.length !==
        Math.min(20, Math.max(0, (body.total as number) - offset)) ||
      body.has_more !== offset + body.items.length < (body.total as number)
    )
      throw ownLeaveError(null);
    const items = body.items.map((row) => ownRow(row, studentID));
    if (
      new Set(items.map((row) => row.leave_id)).size !== items.length ||
      items.some((row) => status && row.status !== status)
    )
      throw ownLeaveError(null);
    if (signal.aborted) throw ownLeaveError(null);
    return {
      items,
      total: body.total as number,
      limit: 20,
      offset,
      has_more: body.has_more as boolean,
    };
  } catch (reason) {
    throw ownLeaveError(reason);
  }
}
export async function getOwnLeave(
  id: string,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<OwnLeave> {
  try {
    if (!leaveUUID(id) || !leaveUUID(studentID))
      throw new OwnLeaveError('invalid', 'Choose a valid leave request.');
    const row = ownRow(
      await json(
        await authorizedRequest(
          `/api/v1/leaves/${id.toLowerCase()}`,
          uid,
          signal,
        ),
        200,
      ),
      studentID,
    );
    if (row.leave_id !== id.toLowerCase() || signal.aborted)
      throw ownLeaveError(null);
    return row;
  } catch (reason) {
    throw ownLeaveError(reason);
  }
}
export async function submitOwnLeave(
  payload: LeaveSubmission,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<OwnLeave> {
  try {
    // Exact retries must remain possible after the start passes: the backend checks
    // the existing request_id before its future-start rule. Do not regenerate it.
    if (
      !leaveUUID(studentID) ||
      !leaveUUID(payload.request_id) ||
      !Number.isFinite(Date.parse(payload.starts_at)) ||
      !Number.isFinite(Date.parse(payload.ends_at)) ||
      Date.parse(payload.ends_at) <= Date.parse(payload.starts_at) ||
      reasonError(payload.reason)
    )
      throw new OwnLeaveError(
        'invalid',
        'Invalid leave submission. Review the details.',
      );
    const row = ownRow(
      await json(
        await authorizedRequest('/api/v1/leaves', uid, signal, {
          method: 'POST',
          contentType: 'application/json',
          body: JSON.stringify({
            request_id: payload.request_id,
            starts_at: payload.starts_at,
            ends_at: payload.ends_at,
            reason: payload.reason,
          }),
        }),
        201,
      ),
      studentID,
    );
    if (
      row.request_id !== payload.request_id ||
      row.reason !== payload.reason ||
      Date.parse(row.starts_at) !== Date.parse(payload.starts_at) ||
      Date.parse(row.ends_at) !== Date.parse(payload.ends_at) ||
      signal.aborted
    )
      throw ownLeaveError(null);
    return row;
  } catch (reason) {
    throw ownLeaveError(reason);
  }
}
