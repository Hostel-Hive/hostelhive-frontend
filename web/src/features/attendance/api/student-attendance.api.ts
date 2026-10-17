import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  StudentPresence,
  AttendanceScan,
  ScanPage,
} from '../attendance.types';
export class AttendanceError extends Error {
  constructor(
    public readonly kind:
      'session' | 'forbidden' | 'not-found' | 'invalid' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function attendanceError(reason: unknown): AttendanceError {
  if (reason instanceof AttendanceError) return reason;
  if (reason instanceof AuthorizedRequestError)
    return new AttendanceError(reason.kind, reason.message);
  return new AttendanceError(
    'unavailable',
    'Attendance service unavailable. Please try again.',
  );
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    value,
  ) &&
  value !== '00000000-0000-0000-0000-000000000000';
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
const invalidResponse = () =>
  new AttendanceError(
    'unavailable',
    'Attendance response could not be verified. Please try again.',
  );
function studentID(id: string) {
  const canonical = id.toLowerCase();
  if (!uuid(canonical))
    throw new AttendanceError('invalid', 'Invalid student profile ID.');
  return canonical;
}
async function read(
  endpoint: string,
  query: URLSearchParams,
  uid: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await authorizedRequest(
    `/api/v1/attendance/${endpoint}?${query}`,
    uid,
    signal,
  );
  const errors = {
    400: [
      'invalid',
      'The attendance request was rejected. Reload the profile and try again.',
    ],
    401: ['session', 'Your session has expired. Sign in again.'],
    403: [
      'forbidden',
      'You do not have permission to view student attendance.',
    ],
    404: ['not-found', 'Attendance is unavailable for this student profile.'],
  } as const;
  if (response.status in errors) {
    const [kind, message] = errors[response.status as keyof typeof errors];
    throw new AttendanceError(kind, message);
  }
  if (response.status !== 200) throw attendanceError(null);
  return response.json();
}
export async function getStudentPresence(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<StudentPresence> {
  const canonical = studentID(id);
  const value = (await read(
    'presence',
    new URLSearchParams({ student_id: canonical }),
    uid,
    signal,
  )) as StudentPresence;
  if (
    !value ||
    value.student_id !== canonical ||
    !['IN', 'OUT', 'UNKNOWN'].includes(value.status) ||
    (value.status === 'UNKNOWN'
      ? value.updated_at !== null
      : !timestamp(value.updated_at))
  )
    throw invalidResponse();
  return {
    student_id: value.student_id,
    status: value.status,
    updated_at: value.updated_at,
  };
}
export async function getStudentScans(
  id: string,
  uid: string,
  signal: AbortSignal,
  offset = 0,
): Promise<ScanPage> {
  const canonical = studentID(id);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
    throw new AttendanceError('invalid', 'Invalid attendance page.');
  const value = (await read(
    'events',
    new URLSearchParams({
      student_id: canonical,
      limit: '20',
      offset: String(offset),
    }),
    uid,
    signal,
  )) as ScanPage;
  const valid = (item: unknown): item is AttendanceScan => {
    if (!item || typeof item !== 'object') return false;
    const row = item as AttendanceScan;
    return (
      row.student_id === canonical &&
      uuid(row.device_id) &&
      uuid(row.event_id) &&
      ['IN', 'OUT'].includes(row.direction) &&
      ['recorded', 'cooldown', 'already_in', 'already_out'].includes(
        row.outcome,
      ) &&
      timestamp(row.occurred_at) &&
      (row.access_result === undefined ||
        ['approved', 'unapproved', 'not_required', 'not_evaluated'].includes(
          row.access_result,
        )) &&
      (row.late_access_id === undefined || uuid(row.late_access_id)) &&
      (row.incident_id === undefined || uuid(row.incident_id))
    );
  };
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    !value.items.every(valid) ||
    new Set(value.items.map((row) => `${row.device_id}:${row.event_id}`))
      .size !== value.items.length ||
    value.limit !== 20 ||
    value.offset !== offset ||
    typeof value.has_more !== 'boolean' ||
    (value.has_more && value.items.length !== 20)
  )
    throw invalidResponse();
  return {
    limit: 20,
    offset,
    has_more: value.has_more,
    items: value.items.map(
      ({
        student_id,
        event_id,
        device_id,
        direction,
        outcome,
        occurred_at,
        access_result,
        late_access_id,
        incident_id,
      }) => ({
        student_id,
        event_id,
        device_id,
        direction,
        outcome,
        occurred_at,
        ...(access_result ? { access_result } : {}),
        ...(late_access_id ? { late_access_id } : {}),
        ...(incident_id ? { incident_id } : {}),
      }),
    ),
  };
}
