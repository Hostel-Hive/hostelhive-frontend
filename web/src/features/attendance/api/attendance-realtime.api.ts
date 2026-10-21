import { authorizedRequest } from '../../auth/api/authorized-request';
import { AttendanceError } from './student-attendance.api';
import type { PresenceSummary } from './staff-attendance.api';

export interface RealtimeSession {
  database_url: string;
  path: 'hostelhive/attendance';
  expires_at: string;
  renew_after_seconds: number;
}
export interface PublicationStatus {
  enabled: boolean;
  pending: boolean;
  version: number;
  published_version: number | null;
  changed_at: string;
  published_at: string | null;
  attempts: number;
  pending_grants: number;
}
export interface AttendanceProjection {
  version: number;
  changed_at: number;
  published_at: number;
  summary: PresenceSummary;
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
export const realtimeUnavailable = () =>
  new AttendanceError(
    'unavailable',
    'Live attendance is unavailable. You can still refresh attendance manually.',
  );

async function read(uid: string, signal: AbortSignal, session: boolean) {
  const response = await authorizedRequest(
    `/api/v1/attendance/realtime/${session ? 'session' : 'status'}`,
    uid,
    signal,
    session ? { method: 'POST' } : undefined,
  );
  if (response.status === 401)
    throw new AttendanceError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new AttendanceError(
      'forbidden',
      'Admin or Warden access is required.',
    );
  if (response.status !== 200 || signal.aborted) throw realtimeUnavailable();
  return response.json() as Promise<unknown>;
}
export async function createRealtimeSession(
  uid: string,
  signal: AbortSignal,
): Promise<RealtimeSession> {
  const value = await read(uid, signal, true);
  if (!record(value) || typeof value.database_url !== 'string')
    throw realtimeUnavailable();
  let url: URL;
  try {
    url = new URL(value.database_url);
  } catch {
    throw realtimeUnavailable();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    url.pathname !== '/' ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.(?:firebaseio\.com|firebasedatabase\.app)$/.test(
      url.hostname,
    ) ||
    value.path !== 'hostelhive/attendance' ||
    !time(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.now() ||
    Date.parse(value.expires_at) > Date.now() + 600000 ||
    !integer(value.renew_after_seconds) ||
    value.renew_after_seconds < 1 ||
    value.renew_after_seconds * 1000 >=
      Date.parse(value.expires_at) - Date.now()
  )
    throw realtimeUnavailable();
  return {
    database_url: url.origin,
    path: value.path,
    expires_at: value.expires_at,
    renew_after_seconds: value.renew_after_seconds,
  };
}
export async function getPublicationStatus(
  uid: string,
  signal: AbortSignal,
): Promise<PublicationStatus> {
  const value = await read(uid, signal, false);
  if (
    !record(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.pending !== 'boolean' ||
    !integer(value.version) ||
    (value.published_version !== null &&
      (!integer(value.published_version) ||
        value.published_version > value.version)) ||
    !time(value.changed_at) ||
    (value.published_at !== null && !time(value.published_at)) ||
    (value.published_version === null) !== (value.published_at === null) ||
    !integer(value.attempts) ||
    !integer(value.pending_grants)
  )
    throw realtimeUnavailable();
  return {
    enabled: value.enabled,
    pending: value.pending,
    version: value.version,
    published_version: value.published_version,
    changed_at: value.changed_at,
    published_at: value.published_at,
    attempts: value.attempts,
    pending_grants: value.pending_grants,
  };
}
export function attendanceProjection(value: unknown): AttendanceProjection {
  if (
    !record(value) ||
    !integer(value.version) ||
    !integer(value.changed_at) ||
    !integer(value.published_at) ||
    value.changed_at > value.published_at ||
    value.published_at > Date.now() + 60000 ||
    !record(value.summary) ||
    !['total', 'in', 'out', 'unknown'].every((key) =>
      integer(value.summary && (value.summary as Record<string, unknown>)[key]),
    )
  )
    throw realtimeUnavailable();
  const summary = value.summary as unknown as PresenceSummary;
  if (summary.in + summary.out + summary.unknown !== summary.total)
    throw realtimeUnavailable();
  return {
    version: value.version,
    changed_at: value.changed_at,
    published_at: value.published_at,
    summary: {
      total: summary.total,
      in: summary.in,
      out: summary.out,
      unknown: summary.unknown,
    },
  };
}
