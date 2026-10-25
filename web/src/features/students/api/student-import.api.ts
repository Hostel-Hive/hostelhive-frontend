import { StudentRequestError } from './students.api';
import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  MAX_CSV_BYTES,
  parseImportReport,
  STUDENT_CSV_COLUMNS,
} from '../student-import';
import type { ImportReport } from '../student-import';

async function registrationResponse(
  path: string,
  uid: string,
  signal: AbortSignal,
  file?: File,
) {
  let response: Response;
  try {
    response = await authorizedRequest(
      '/api/v1/student-invitations/import' + path,
      uid,
      signal,
      file
        ? { method: 'POST', body: file, contentType: 'text/csv; charset=utf-8' }
        : undefined,
    );
  } catch (error) {
    throw new StudentRequestError(
      error instanceof AuthorizedRequestError && error.kind === 'session'
        ? 'session'
        : 'unavailable',
      'Unable to confirm student registration.',
    );
  }
  if (response.status === 401)
    throw new StudentRequestError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new StudentRequestError(
      'forbidden',
      'Only an Admin can register students.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new StudentRequestError(
      'invalid',
      'Choose a UTF-8 registration CSV with at most 100 records and 2 MiB.',
    );
  if (!response.ok)
    throw new StudentRequestError(
      'unavailable',
      'Student registration is unavailable.',
    );
  return response;
}

// The page groups new registrations and exact replays as confirmed profiles.
// Unavailable rows remain unconfirmed; never infer success from an HTTP 200.
export function registrationReport(value: unknown): ImportReport {
  const invalid = () => {
    throw new Error('The registration result could not be verified.');
  };
  if (!value || typeof value !== 'object') return invalid();
  const report = value as Record<string, unknown>;
  const statuses = [
    'queued',
    'replayed',
    'rejected',
    'not_attempted',
    'retry_required',
  ] as const;
  if (
    !Number.isInteger(report.total) ||
    Number(report.total) < 1 ||
    Number(report.total) > 100 ||
    statuses.some(
      (k) => !Number.isInteger(report[k]) || Number(report[k]) < 0,
    ) ||
    statuses.reduce((n, k) => n + Number(report[k]), 0) !== report.total ||
    !Array.isArray(report.rows) ||
    report.rows.length !== report.total
  )
    return invalid();
  const counts = {
    queued: 0,
    replayed: 0,
    rejected: 0,
    not_attempted: 0,
    retry_required: 0,
  };
  const wireRows = report.rows;
  const rows = wireRows.map((row: Record<string, unknown>) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !Object.hasOwn(counts, String(row.status))
    )
      return invalid();
    counts[row.status as keyof typeof counts]++;
    const success = row.status === 'queued' || row.status === 'replayed';
    if (
      success &&
      (typeof row.invitation_id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          row.invitation_id,
        ) ||
        row.error !== undefined)
    )
      return invalid();
    return {
      record: row.record,
      line: row.line,
      status: success
        ? 'created'
        : row.status === 'retry_required'
          ? 'not_attempted'
          : row.status,
      ...(success ? { student_id: row.student_id } : { error: row.error }),
    };
  });
  if (statuses.some((k) => counts[k] !== report[k])) return invalid();
  const parsed = parseImportReport({
    total: report.total,
    created: counts.queued + counts.replayed,
    rejected: counts.rejected,
    not_attempted: counts.not_attempted + counts.retry_required,
    ...(report.stopped_reason ? { stopped_reason: report.stopped_reason } : {}),
    rows,
  });
  return {
    ...parsed,
    registration: counts,
    rows: parsed.rows.map((row, index) => ({
      ...row,
      registration_status: wireRows[index].status as NonNullable<
        ImportReport['rows'][number]['registration_status']
      >,
    })),
  };
}

export async function getStudentImportTemplate(
  uid: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await registrationResponse('/template', uid, signal);
  if (
    response.status !== 200 ||
    response.headers.get('Content-Type')?.split(';')[0].trim() !== 'text/csv'
  )
    throw new Error('Template unavailable.');
  const text = await response.text();
  if (text.trim() !== STUDENT_CSV_COLUMNS.join(','))
    throw new Error('Template unavailable.');
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}
export async function importStudents(
  file: File,
  uid: string,
  signal: AbortSignal,
): Promise<ImportReport> {
  if (!file.size || file.size > MAX_CSV_BYTES)
    throw new StudentRequestError(
      'invalid',
      'Choose a non-empty CSV up to 2 MiB.',
    );
  const response = await registrationResponse('', uid, signal, file);
  if (response.status !== 200)
    throw new Error('The import result could not be verified.');
  return registrationReport(await response.json());
}
