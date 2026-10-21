import { authorizedRequest } from '../../auth/api/authorized-request';
import { AttendanceError, attendanceError } from './student-attendance.api';

export interface PresenceRow {
  student_id: string;
  index_no: string;
  full_name: string;
  status: 'IN' | 'OUT' | 'UNKNOWN';
  updated_at: string | null;
}
export interface PresenceSummary {
  total: number;
  in: number;
  out: number;
  unknown: number;
}
export interface Incident {
  incident_id: string;
  device_id: string;
  event_id: string;
  student_id: string;
  direction: 'IN' | 'OUT';
  incident_type: 'late_entry' | 'early_exit';
  occurred_at: string;
  hostel_timezone: string;
  exit_opening_minute: number;
  entry_deadline_minute: number;
  permission_window_seconds: number;
}
export interface StaffAttendancePage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface IncidentFilters {
  studentID: string;
  direction: '' | 'IN' | 'OUT';
  type: '' | 'late_entry' | 'early_exit';
}
export const emptyIncidentFilters: IncidentFilters = {
  studentID: '',
  direction: '',
  type: '',
};
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(v) &&
  v !== '00000000-0000-0000-0000-000000000000';
const date = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const text = (v: unknown): v is string =>
  typeof v === 'string' && Boolean(v.trim()) && !/\p{Cc}/u.test(v);
const unavailable = () =>
  new AttendanceError(
    'unavailable',
    'Attendance data could not be verified. Please retry.',
  );
export function attendanceSearch(query: string): string {
  const value = query.trim();
  if (Array.from(value).length > 200 || /\p{Cc}/u.test(value))
    throw new AttendanceError(
      'invalid',
      'Search must be at most 200 characters without control characters.',
    );
  return value;
}
export function validateIncidentFilters(
  filters: IncidentFilters,
): IncidentFilters {
  const studentID = filters.studentID.trim().toLowerCase();
  if (
    (studentID && !uuid(studentID)) ||
    !['', 'IN', 'OUT'].includes(filters.direction) ||
    !['', 'late_entry', 'early_exit'].includes(filters.type)
  )
    throw new AttendanceError(
      'invalid',
      'Choose valid incident filters. Student profile ID must be a UUID.',
    );
  return { ...filters, studentID };
}
function offsetOK(offset: number) {
  if (!integer(offset) || offset > 1000000)
    throw new AttendanceError('invalid', 'Choose a valid attendance page.');
}
async function read(
  path: string,
  uid: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await authorizedRequest(
    `/api/v1/attendance/${path}`,
    uid,
    signal,
  );
  if (response.status === 401)
    throw new AttendanceError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new AttendanceError(
      'forbidden',
      'Admin or Warden access is required to view attendance.',
    );
  if (response.status === 404)
    throw new AttendanceError(
      'not-found',
      'This attendance incident is unavailable or no longer exists.',
    );
  if (response.status === 400)
    throw new AttendanceError(
      'invalid',
      'The attendance request was rejected. Check your filters.',
    );
  if (response.status !== 200 || signal.aborted) throw unavailable();
  return response.json();
}
function page<T>(
  value: unknown,
  offset: number,
  valid: (v: unknown) => v is T,
  identity: (v: T) => string,
): StaffAttendancePage<T> {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(valid) ||
    !integer(value.total) ||
    value.limit !== 20 ||
    value.offset !== offset ||
    value.items.length !== Math.min(20, Math.max(0, value.total - offset)) ||
    value.has_more !== offset + value.items.length < value.total ||
    new Set(value.items.map(identity)).size !== value.items.length
  )
    throw unavailable();
  return value as unknown as StaffAttendancePage<T>;
}
function validPresence(v: unknown): v is PresenceRow {
  return (
    record(v) &&
    uuid(v.student_id) &&
    text(v.index_no) &&
    text(v.full_name) &&
    typeof v.status === 'string' &&
    ['IN', 'OUT', 'UNKNOWN'].includes(v.status) &&
    (v.status === 'UNKNOWN' ? v.updated_at === null : date(v.updated_at))
  );
}
function validIncident(v: unknown): v is Incident {
  return (
    record(v) &&
    uuid(v.incident_id) &&
    uuid(v.student_id) &&
    uuid(v.device_id) &&
    uuid(v.event_id) &&
    ((v.direction === 'IN' && v.incident_type === 'late_entry') ||
      (v.direction === 'OUT' && v.incident_type === 'early_exit')) &&
    date(v.occurred_at) &&
    text(v.hostel_timezone) &&
    integer(v.exit_opening_minute) &&
    v.exit_opening_minute < 1440 &&
    integer(v.entry_deadline_minute) &&
    v.entry_deadline_minute < 1440 &&
    integer(v.permission_window_seconds) &&
    v.permission_window_seconds > 0
  );
}
export async function getPresenceSummary(
  uid: string,
  signal: AbortSignal,
  query = '',
): Promise<PresenceSummary> {
  try {
    const q = attendanceSearch(query);
    const v = await read(
      `summary${q ? `?${new URLSearchParams({ q })}` : ''}`,
      uid,
      signal,
    );
    if (
      !record(v) ||
      !integer(v.total) ||
      !integer(v.in) ||
      !integer(v.out) ||
      !integer(v.unknown) ||
      v.in + v.out + v.unknown !== v.total
    )
      throw unavailable();
    return { total: v.total, in: v.in, out: v.out, unknown: v.unknown };
  } catch (error) {
    throw attendanceError(error);
  }
}
export async function listPresence(
  uid: string,
  signal: AbortSignal,
  query = '',
  status = '',
  offset = 0,
): Promise<StaffAttendancePage<PresenceRow>> {
  try {
    offsetOK(offset);
    const q = attendanceSearch(query);
    if (!['', 'IN', 'OUT', 'UNKNOWN'].includes(status))
      throw new AttendanceError('invalid', 'Choose a valid presence status.');
    const params = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const result = page(
      await read(`students?${params}`, uid, signal),
      offset,
      validPresence,
      (v) => v.student_id,
    );
    if (status && result.items.some((row) => row.status !== status))
      throw unavailable();
    return result;
  } catch (error) {
    throw attendanceError(error);
  }
}
export async function listIncidents(
  uid: string,
  signal: AbortSignal,
  filters = emptyIncidentFilters,
  offset = 0,
): Promise<StaffAttendancePage<Incident>> {
  try {
    offsetOK(offset);
    const f = validateIncidentFilters(filters);
    const params = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (f.studentID) params.set('student_id', f.studentID);
    if (f.direction) params.set('direction', f.direction);
    if (f.type) params.set('incident_type', f.type);
    const result = page(
      await read(`incidents?${params}`, uid, signal),
      offset,
      validIncident,
      (v) => v.incident_id,
    );
    if (
      new Set(result.items.map((v) => `${v.device_id}:${v.event_id}`)).size !==
        result.items.length ||
      result.items.some(
        (v) =>
          (f.studentID && v.student_id !== f.studentID) ||
          (f.direction && v.direction !== f.direction) ||
          (f.type && v.incident_type !== f.type),
      )
    )
      throw unavailable();
    return result;
  } catch (error) {
    throw attendanceError(error);
  }
}
export async function getIncident(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Incident> {
  try {
    const canonical = id.toLowerCase();
    if (!uuid(canonical))
      throw new AttendanceError(
        'invalid',
        'Choose a valid incident reference.',
      );
    const v = await read(`incidents/${canonical}`, uid, signal);
    if (!validIncident(v) || v.incident_id !== canonical) throw unavailable();
    return v;
  } catch (error) {
    throw attendanceError(error);
  }
}
