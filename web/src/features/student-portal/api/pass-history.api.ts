import { authorizedRequest } from '../../auth/api/authorized-request';
import { StudentPortalError, portalError } from './student-portal.api';
export const passStatuses = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type PassStatus = (typeof passStatuses)[number];
export interface PassQuery {
  type: '' | 'leave' | 'late_access';
  status: '' | PassStatus;
  offset: number;
}
export interface StudentPass {
  type: 'leave' | 'late_access';
  source_id: string;
  request_id: string;
  student_id: string;
  reason: string;
  status: PassStatus;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  direction: 'IN' | 'OUT' | null;
  expected_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  consumed_at: string | null;
}
export interface PassPage {
  items: StudentPass[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
const time = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
const unavailable = () =>
  new StudentPortalError(
    'unavailable',
    'Unable to load your pass history. Please try again.',
  );
export function passHistoryQuery(params: URLSearchParams): PassQuery | null {
  for (const key of params.keys())
    if (
      !['type', 'status', 'offset'].includes(key) ||
      params.getAll(key).length !== 1
    )
      return null;
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const rawOffset = params.get('offset');
  if (
    (params.has('type') && !type) ||
    (params.has('status') && !status) ||
    !['', 'leave', 'late_access'].includes(type) ||
    !['', ...passStatuses].includes(status) ||
    (rawOffset !== null && !/^\d+$/.test(rawOffset))
  )
    return null;
  const offset = Number(rawOffset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
    return null;
  return {
    type: type as PassQuery['type'],
    status: status as PassQuery['status'],
    offset,
  };
}
export function validPass(
  value: unknown,
  studentID: string,
): value is StudentPass {
  if (!value || typeof value !== 'object') return false;
  const r = value as StudentPass;
  if (
    !['leave', 'late_access'].includes(r.type) ||
    !uuid(r.source_id) ||
    !uuid(r.request_id) ||
    !uuid(r.student_id) ||
    r.student_id.toLowerCase() !== studentID.toLowerCase() ||
    !passStatuses.includes(r.status) ||
    typeof r.reason !== 'string' ||
    !time(r.created_at) ||
    typeof r.decision_note !== 'string'
  )
    return false;
  if (r.type === 'leave') {
    if (
      !time(r.starts_at) ||
      !time(r.ends_at) ||
      Date.parse(r.ends_at) <= Date.parse(r.starts_at) ||
      r.direction !== null ||
      r.expected_at !== null ||
      r.consumed_at !== null
    )
      return false;
  } else if (
    r.starts_at !== null ||
    r.ends_at !== null ||
    !['IN', 'OUT'].includes(r.direction ?? '') ||
    !time(r.expected_at)
  )
    return false;
  if (r.status === 'cancelled')
    return (
      time(r.cancelled_at) &&
      uuid(r.cancelled_by) &&
      r.decided_at === null &&
      r.decided_by === null &&
      r.decision_note === '' &&
      r.consumed_at === null
    );
  if (r.cancelled_at !== null || r.cancelled_by !== null) return false;
  if (r.status === 'pending')
    return (
      r.decided_at === null &&
      r.decided_by === null &&
      r.decision_note === '' &&
      r.consumed_at === null
    );
  return (
    time(r.decided_at) &&
    uuid(r.decided_by) &&
    (r.consumed_at === null ||
      (r.type === 'late_access' &&
        r.status === 'approved' &&
        time(r.consumed_at)))
  );
}
export async function listOwnPasses(
  uid: string,
  studentID: string,
  query: PassQuery,
  signal: AbortSignal,
): Promise<PassPage> {
  if (
    !uuid(studentID) ||
    !['', 'leave', 'late_access'].includes(query.type) ||
    !['', ...passStatuses].includes(query.status) ||
    !Number.isSafeInteger(query.offset) ||
    query.offset < 0 ||
    query.offset > 1000000
  )
    throw unavailable();
  const params = new URLSearchParams({
    limit: '20',
    offset: String(query.offset),
  });
  if (query.type) params.set('type', query.type);
  if (query.status) params.set('status', query.status);
  try {
    const response = await authorizedRequest(
      '/api/v1/me/passes?' + params,
      uid,
      signal,
    );
    if (response.status === 401)
      throw new StudentPortalError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (response.status === 403) {
      const data: unknown = await response.json().catch(() => null);
      const setup =
        data &&
        typeof data === 'object' &&
        'error' in data &&
        data.error === 'setup_required';
      throw new StudentPortalError(
        setup ? 'setup' : 'forbidden',
        setup
          ? 'Complete account setup before opening your pass history.'
          : 'Your account no longer has access to student pass history.',
      );
    }
    if (response.status === 409)
      throw new StudentPortalError(
        'not-found',
        'An active student profile is required to view pass history. Contact your hostel administrator.',
      );
    if (response.status !== 200) throw unavailable();
    const p = (await response.json()) as PassPage | null;
    if (
      !p ||
      !Array.isArray(p.items) ||
      !p.items.every(
        (r) =>
          validPass(r, studentID) &&
          (!query.type || r.type === query.type) &&
          (!query.status || r.status === query.status),
      ) ||
      p.items.length > 20 ||
      p.limit !== 20 ||
      p.offset !== query.offset ||
      !Number.isSafeInteger(p.total) ||
      p.total < 0 ||
      typeof p.has_more !== 'boolean' ||
      p.items.length > Math.max(0, p.total - p.offset) ||
      p.has_more !== p.offset + p.items.length < p.total ||
      new Set(p.items.map((r) => r.type + ':' + r.source_id.toLowerCase()))
        .size !== p.items.length ||
      signal.aborted
    )
      throw unavailable();
    return p;
  } catch (e) {
    throw portalError(e);
  }
}
