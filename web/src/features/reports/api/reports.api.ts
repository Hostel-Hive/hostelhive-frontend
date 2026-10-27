import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  ExportFormat,
  ReportFilters,
  ReportKind,
  ReportPage,
} from '../reports.types';

export class ReportError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'not-found'
      | 'too-large'
      | 'busy'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const reportAccessError = (e: ReportError) =>
  e.kind === 'session' || e.kind === 'forbidden';
export function reportError(error: unknown): ReportError {
  if (error instanceof ReportError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new ReportError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new ReportError(
    'unavailable',
    'The report request could not be confirmed. Please retry.',
  );
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(v) &&
  v !== '00000000-0000-0000-0000-000000000000';
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const text = (v: unknown, max: number, empty = false): v is string =>
  typeof v === 'string' &&
  (empty || Boolean(v.trim())) &&
  Array.from(v).length <= max &&
  !/\p{Cc}/u.test(v.replace(/[\r\n\t]/g, ''));
export function calendarDate(value: string): boolean {
  return (
    /^\d{4}-\d\d-\d\d$/.test(value) &&
    value >= '0001-01-01' &&
    value <= '9998-12-31' &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export function validatedFilters(
  kind: ReportKind,
  input: ReportFilters,
): ReportFilters {
  if (!['attendance', 'daily', 'leaves', 'complaints'].includes(kind))
    throw new ReportError('invalid', 'Choose a supported report.');
  const f = { ...input, studentID: input.studentID.trim().toLowerCase() };
  if (
    !calendarDate(f.from) ||
    !calendarDate(f.to) ||
    day(f.to) < day(f.from) ||
    day(f.to) - day(f.from) > 365
  )
    throw new ReportError(
      'invalid',
      'Choose valid From and To dates, in order, covering at most 366 inclusive calendar days.',
    );
  if (f.studentID && !uuid(f.studentID))
    throw new ReportError(
      'invalid',
      'Student profile ID must be a valid UUID.',
    );
  const attendance = kind === 'attendance' || kind === 'daily';
  if (
    (attendance &&
      (!['', 'IN', 'OUT'].includes(f.direction) || f.status || f.category)) ||
    (!attendance && f.direction) ||
    (kind === 'leaves' &&
      (!['', 'pending', 'approved', 'rejected', 'cancelled'].includes(
        f.status,
      ) ||
        f.category)) ||
    (kind === 'complaints' &&
      (!['', 'pending', 'in_progress', 'resolved'].includes(f.status) ||
        !['', 'maintenance', 'disciplinary'].includes(f.category)))
  )
    throw new ReportError(
      'invalid',
      'Use only the supported filters for this report.',
    );
  return f;
}
const endpoint = (kind: ReportKind) =>
  kind === 'daily' ? 'attendance/daily' : kind;
function query(f: ReportFilters, offset?: number) {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.studentID) q.set('student_id', f.studentID);
  if (f.direction) q.set('direction', f.direction);
  if (f.status) q.set('status', f.status);
  if (f.category) q.set('category', f.category);
  if (offset !== undefined) {
    q.set('limit', '20');
    q.set('offset', String(offset));
  }
  return q;
}
async function checked(response: Response) {
  if (response.status === 200) return response;
  if (response.status === 401)
    throw new ReportError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new ReportError(
      'forbidden',
      'Admin or Warden access is required for reports.',
    );
  if (response.status === 400)
    throw new ReportError(
      'invalid',
      'The report filters were rejected. Check the date range and selections.',
    );
  if (response.status === 404)
    throw new ReportError(
      'not-found',
      'This report route is unavailable. Confirm the running backend version.',
    );
  if (response.status === 413)
    throw new ReportError(
      'too-large',
      'This export is too large. Narrow the date range or filters and try again. Excel supports up to 5,000 rows; PDF up to 1,000 rows and additional document limits.',
    );
  if (response.status === 429)
    throw new ReportError(
      'busy',
      'Report generation is busy. Wait briefly, then retry the same export.',
    );
  throw reportError(null);
}
const optionalUUID = (v: unknown) => v === undefined || v === null || uuid(v);
function movement(v: unknown): boolean {
  return (
    record(v) &&
    uuid(v.event_id) &&
    uuid(v.device_id) &&
    uuid(v.student_id) &&
    ['IN', 'OUT'].includes(String(v.direction)) &&
    timestamp(v.occurred_at) &&
    (v.access_result === undefined ||
      v.access_result === null ||
      ['approved', 'unapproved', 'not_required'].includes(
        String(v.access_result),
      )) &&
    optionalUUID(v.late_access_id) &&
    optionalUUID(v.incident_id) &&
    (v.access_result === 'approved'
      ? uuid(v.late_access_id)
      : v.late_access_id === undefined || v.late_access_id === null)
  );
}
function totals(v: unknown): v is Record<string, unknown> & {
  entries: number;
  exits: number;
  distinct_students: number;
} {
  return (
    record(v) &&
    integer(v.entries) &&
    integer(v.exits) &&
    integer(v.distinct_students) &&
    v.distinct_students <= v.entries + v.exits &&
    (v.entries + v.exits === 0
      ? v.distinct_students === 0
      : v.distinct_students > 0)
  );
}
function leave(v: unknown): boolean {
  if (
    !record(v) ||
    !uuid(v.leave_id) ||
    !uuid(v.request_id) ||
    !uuid(v.student_id) ||
    !uuid(v.submitted_by) ||
    !timestamp(v.starts_at) ||
    !timestamp(v.ends_at) ||
    Date.parse(v.ends_at) <= Date.parse(v.starts_at) ||
    !timestamp(v.created_at) ||
    !text(v.reason, 1000) ||
    !text(v.decision_note, 1000, true)
  )
    return false;
  const cancelled = v.status === 'cancelled';
  if (
    cancelled
      ? !timestamp(v.cancelled_at) || !uuid(v.cancelled_by)
      : (v.cancelled_at !== undefined && v.cancelled_at !== null) ||
        (v.cancelled_by !== undefined && v.cancelled_by !== null)
  )
    return false;
  if (v.status === 'pending' || cancelled)
    return (
      v.decided_at === null && v.decided_by === null && v.decision_note === ''
    );
  return (
    ['approved', 'rejected'].includes(String(v.status)) &&
    timestamp(v.decided_at) &&
    uuid(v.decided_by) &&
    (v.status !== 'rejected' || Boolean(v.decision_note.trim()))
  );
}
function complaint(v: unknown): boolean {
  if (
    !record(v) ||
    !uuid(v.complaint_id) ||
    !uuid(v.request_id) ||
    !uuid(v.student_id) ||
    !uuid(v.submitted_by) ||
    !['maintenance', 'disciplinary'].includes(String(v.category)) ||
    !['pending', 'in_progress', 'resolved'].includes(String(v.status)) ||
    !text(v.description, 2000) ||
    !integer(v.version) ||
    v.version < 1 ||
    !timestamp(v.created_at) ||
    !timestamp(v.updated_at)
  )
    return false;
  if (v.resolution === null) return true;
  const r = v.resolution;
  return (
    v.status === 'resolved' &&
    record(r) &&
    uuid(r.update_id) &&
    uuid(r.resolved_by) &&
    timestamp(r.resolved_at) &&
    text(r.note, 2000, true)
  );
}
function validatePage(
  v: unknown,
  kind: ReportKind,
  f: ReportFilters,
  offset: number,
): ReportPage {
  if (
    !record(v) ||
    v.from !== f.from ||
    v.to !== f.to ||
    !text(v.timezone, 200) ||
    !integer(v.total) ||
    v.limit !== 20 ||
    v.offset !== offset ||
    !Array.isArray(v.items) ||
    v.items.length !== Math.min(20, Math.max(0, v.total - offset)) ||
    v.has_more !== offset + v.items.length < v.total
  )
    throw reportError(null);
  for (const [name, expected] of [
    ['student_id', f.studentID],
    ['direction', f.direction],
    ['status', f.status],
    ['category', f.category],
  ])
    if ((v[name] ?? '') !== expected) throw reportError(null);
  const items = v.items as Record<string, unknown>[];
  let identities: unknown[];
  if (kind === 'attendance' || kind === 'daily') {
    if (
      !totals(v.summary) ||
      (f.direction === 'IN' && v.summary.exits !== 0) ||
      (f.direction === 'OUT' && v.summary.entries !== 0)
    )
      throw reportError(null);
    if (kind === 'attendance') {
      if (
        v.summary.entries + v.summary.exits !== v.total ||
        !items.every(
          (row) =>
            movement(row) &&
            (!f.studentID || row.student_id === f.studentID) &&
            (!f.direction || row.direction === f.direction),
        )
      )
        throw reportError(null);
      identities = items.map((row) => `${row.device_id}:${row.event_id}`);
    } else {
      if (
        v.total !== day(f.to) - day(f.from) + 1 ||
        !items.every(
          (row, index) =>
            record(row) &&
            totals(row) &&
            row.date ===
              new Date((day(f.to) - offset - index) * 86400000)
                .toISOString()
                .slice(0, 10) &&
            (f.direction !== 'IN' || row.exits === 0) &&
            (f.direction !== 'OUT' || row.entries === 0),
        )
      )
        throw reportError(null);
      identities = items.map((row) => row.date);
    }
  } else {
    if (!record(v.summary)) throw reportError(null);
    if (kind === 'leaves') {
      const s = v.summary;
      if (
        !integer(s.pending) ||
        !integer(s.approved) ||
        !integer(s.rejected) ||
        !integer(s.cancelled) ||
        s.pending + s.approved + s.rejected + s.cancelled !== v.total ||
        !items.every(leave)
      )
        throw reportError(null);
      identities = items.map((row) => row.leave_id);
    } else {
      const s = v.summary.by_status,
        c = v.summary.by_category;
      if (
        !record(s) ||
        !record(c) ||
        !integer(s.pending) ||
        !integer(s.in_progress) ||
        !integer(s.resolved) ||
        s.pending + s.in_progress + s.resolved !== v.total ||
        !integer(c.maintenance) ||
        !integer(c.disciplinary) ||
        c.maintenance + c.disciplinary !== v.total ||
        !items.every(complaint)
      )
        throw reportError(null);
      identities = items.map((row) => row.complaint_id);
    }
    if (
      items.some(
        (row) =>
          (f.studentID && row.student_id !== f.studentID) ||
          (f.status && row.status !== f.status) ||
          (f.category && row.category !== f.category),
      )
    )
      throw reportError(null);
  }
  if (new Set(identities).size !== items.length) throw reportError(null);
  return { ...v, kind } as unknown as ReportPage;
}
export async function getReport(
  kind: ReportKind,
  input: ReportFilters,
  offset: number,
  uid: string,
  signal: AbortSignal,
): Promise<ReportPage> {
  try {
    const f = validatedFilters(kind, input);
    if (!integer(offset) || offset > 1000000)
      throw new ReportError('invalid', 'Choose a valid report page.');
    const response = await checked(
      await authorizedRequest(
        `/api/v1/reports/${endpoint(kind)}?${query(f, offset)}`,
        uid,
        signal,
      ),
    );
    const data = validatePage(await response.json(), kind, f, offset);
    if (signal.aborted) throw reportError(null);
    return data;
  } catch (error) {
    throw reportError(error);
  }
}
export interface ReportDownload {
  blob: Blob;
  filename: string;
  format: ExportFormat;
}
export async function exportReport(
  kind: ReportKind,
  input: ReportFilters,
  format: ExportFormat,
  uid: string,
  signal: AbortSignal,
): Promise<ReportDownload> {
  try {
    const f = validatedFilters(kind, input);
    if (!['pdf', 'xlsx'].includes(format))
      throw new ReportError('invalid', 'Choose PDF or Excel.');
    const path = `${endpoint(kind)}/export${format === 'pdf' ? '/pdf' : ''}`;
    const response = await checked(
      await authorizedRequest(
        `/api/v1/reports/${path}?${query(f)}`,
        uid,
        signal,
      ),
    );
    const mime =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (
      response.headers
        .get('Content-Type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== mime
    )
      throw reportError(null);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (
      !blob.size ||
      (format === 'pdf'
        ? new TextDecoder().decode(bytes) !== '%PDF-'
        : bytes[0] !== 80 ||
          bytes[1] !== 75 ||
          bytes[2] !== 3 ||
          bytes[3] !== 4) ||
      signal.aborted
    )
      throw reportError(null);
    return {
      blob,
      format,
      filename: `hostelhive-${kind === 'daily' ? 'attendance-daily' : kind}-${f.from}-to-${f.to}.${format}`,
    };
  } catch (error) {
    throw reportError(error);
  }
}
