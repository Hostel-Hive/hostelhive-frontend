import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  lateAccessStatuses,
  lateAccessUUID,
  validLateAccess,
} from '../../late-access/api/late-access.api';
import type {
  LateAccessRequest,
  LateAccessStatus,
} from '../../late-access/late-access.types';
import { StudentPortalError } from './student-portal.api';

export type OwnLateAccess = Pick<
  LateAccessRequest,
  | 'late_access_id'
  | 'request_id'
  | 'direction'
  | 'expected_at'
  | 'consumed_at'
  | 'cancelled_at'
  | 'reason'
  | 'status'
  | 'created_at'
  | 'decided_at'
  | 'decision_note'
>;
export interface OwnLateAccessPage {
  items: OwnLateAccess[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}
export interface LateAccessDraft {
  direction: '' | 'IN' | 'OUT';
  expected: string;
  reason: string;
}
export interface LateAccessSubmission {
  request_id: string;
  direction: 'IN' | 'OUT';
  expected_at: string;
  reason: string;
}
export class OwnLateAccessError extends Error {
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
export function ownLateAccessError(reason: unknown): OwnLateAccessError {
  if (reason instanceof OwnLateAccessError) return reason;
  if (reason instanceof AuthorizedRequestError && reason.kind === 'session')
    return new OwnLateAccessError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new OwnLateAccessError(
    'unavailable',
    'Unable to confirm the access request. Please try again.',
  );
}
export function lateAccessAccountError(
  error: OwnLateAccessError,
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
  if (!reason.trim()) return 'Enter a reason for your access request.';
  if (Array.from(reason.trim()).length > 1000)
    return 'Use 1000 characters or fewer for your reason.';
  if (/[\p{Cc}]/u.test(reason.replace(/[\n\r\t]/g, '')))
    return 'Remove unsupported control characters from your reason.';
  return '';
}
export function validateLateAccessDraft(
  draft: LateAccessDraft,
  now = Date.now(),
): string {
  if (draft.direction !== 'IN' && draft.direction !== 'OUT')
    return 'Choose early exit or late entry.';
  const expected = localDate(draft.expected);
  if (!expected) return 'Enter a valid expected date and time.';
  if (expected.getTime() <= now)
    return 'The expected movement must be in the future.';
  return reasonError(draft.reason);
}
export function prepareLateAccessSubmission(
  draft: LateAccessDraft,
  requestID: string,
): LateAccessSubmission {
  const invalid = validateLateAccessDraft(draft);
  if (invalid || !lateAccessUUID(requestID))
    throw new OwnLateAccessError(
      'invalid',
      invalid || 'Unable to prepare a request. Reload and try again.',
    );
  return {
    request_id: requestID.toLowerCase(),
    direction: draft.direction as 'IN' | 'OUT',
    expected_at: localDate(draft.expected)!.toISOString(),
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
    throw new OwnLateAccessError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new OwnLateAccessError(
      code === 'setup_required' ? 'setup' : 'forbidden',
      code === 'setup_required'
        ? 'Complete your student account setup before requesting access.'
        : 'Your account no longer has access to these access requests.',
    );
  if (response.status === 404)
    throw new OwnLateAccessError(
      'not-found',
      'This access request is unavailable or does not belong to your account.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new OwnLateAccessError(
      'invalid',
      'Check direction, expected time and reason. The time must be in the future and require permission under hostel policy.',
    );
  if (response.status === 409)
    throw new OwnLateAccessError(
      code === 'active_student_required' ? 'ineligible' : 'conflict',
      code === 'active_student_required'
        ? 'An active student profile is required to request access. Contact your hostel administrator.'
        : 'A pending or approved request already exists for this direction and time, or the submission details changed. Review your existing access requests.',
    );
  throw ownLateAccessError(null);
}
function ownRow(value: unknown, studentID: string): OwnLateAccess {
  if (!validLateAccess(value) || value.student_id !== studentID.toLowerCase())
    throw ownLateAccessError(null);
  const {
    late_access_id,
    request_id,
    direction,
    expected_at,
    reason,
    status,
    created_at,
    decided_at,
    decision_note,
    consumed_at,
    cancelled_at,
  } = value;
  return {
    late_access_id,
    request_id,
    direction,
    expected_at,
    reason,
    status,
    created_at,
    decided_at,
    decision_note,
    ...(consumed_at ? { consumed_at } : {}),
    ...(cancelled_at ? { cancelled_at } : {}),
  };
}
export async function listOwnLateAccess(
  uid: string,
  studentID: string,
  signal: AbortSignal,
  status: LateAccessStatus | '' = '',
  offset = 0,
): Promise<OwnLateAccessPage> {
  try {
    if (
      !lateAccessUUID(studentID) ||
      (status && !lateAccessStatuses.includes(status)) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > Number.MAX_SAFE_INTEGER - 20
    )
      throw new OwnLateAccessError(
        'invalid',
        'Choose a valid status and page.',
      );
    const query = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (status) query.set('status', status);
    const body = await json(
      await authorizedRequest(
        `/api/v1/late-access-requests?${query}`,
        uid,
        signal,
      ),
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
      throw ownLateAccessError(null);
    const items = body.items.map((row) => ownRow(row, studentID));
    if (
      new Set(items.map((row) => row.late_access_id)).size !== items.length ||
      items.some((row) => status && row.status !== status)
    )
      throw ownLateAccessError(null);
    if (signal.aborted) throw ownLateAccessError(null);
    return {
      items,
      total: body.total as number,
      limit: 20,
      offset,
      has_more: body.has_more as boolean,
    };
  } catch (reason) {
    throw ownLateAccessError(reason);
  }
}
export async function getOwnLateAccess(
  id: string,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<OwnLateAccess> {
  try {
    if (!lateAccessUUID(id) || !lateAccessUUID(studentID))
      throw new OwnLateAccessError('invalid', 'Choose a valid access request.');
    const row = ownRow(
      await json(
        await authorizedRequest(
          `/api/v1/late-access-requests/${id.toLowerCase()}`,
          uid,
          signal,
        ),
        200,
      ),
      studentID,
    );
    if (row.late_access_id !== id.toLowerCase() || signal.aborted)
      throw ownLateAccessError(null);
    return row;
  } catch (reason) {
    throw ownLateAccessError(reason);
  }
}
export async function submitOwnLateAccess(
  payload: LateAccessSubmission,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<OwnLateAccess> {
  try {
    // Preserve exact retries after the expected time: the backend resolves the
    // request_id before checking the current time and permission policy.
    if (
      !lateAccessUUID(studentID) ||
      !lateAccessUUID(payload.request_id) ||
      !['IN', 'OUT'].includes(payload.direction) ||
      !Number.isFinite(Date.parse(payload.expected_at)) ||
      reasonError(payload.reason)
    )
      throw new OwnLateAccessError(
        'invalid',
        'Invalid access submission. Review the details.',
      );
    const row = ownRow(
      await json(
        await authorizedRequest('/api/v1/late-access-requests', uid, signal, {
          method: 'POST',
          contentType: 'application/json',
          body: JSON.stringify({
            request_id: payload.request_id,
            direction: payload.direction,
            expected_at: payload.expected_at,
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
      row.direction !== payload.direction ||
      Date.parse(row.expected_at) !== Date.parse(payload.expected_at) ||
      signal.aborted
    )
      throw ownLateAccessError(null);
    return row;
  } catch (reason) {
    throw ownLateAccessError(reason);
  }
}

export async function cancelOwnLateAccess(
  id: string,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<OwnLateAccess> {
  try {
    if (!lateAccessUUID(id) || !lateAccessUUID(studentID))
      throw new OwnLateAccessError('invalid', 'Choose a valid access request.');
    const row = ownRow(
      await json(
        await authorizedRequest(
          `/api/v1/late-access-requests/${id.toLowerCase()}/cancel`,
          uid,
          signal,
          { method: 'POST' },
        ),
        200,
      ),
      studentID,
    );
    if (
      row.late_access_id !== id.toLowerCase() ||
      row.status !== 'cancelled' ||
      signal.aborted
    )
      throw ownLateAccessError(null);
    return row;
  } catch (reason) {
    throw ownLateAccessError(reason);
  }
}
