import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export interface InboxNotification {
  notification_id: string;
  source_type:
    'complaint' | 'leave' | 'late_access' | 'announcement' | 'attendance';
  complaint_id?: string;
  leave_id?: string;
  late_access_id?: string;
  announcement_id?: string;
  attendance_incident_id?: string;
  kind: string;
  category?: string;
  status: string;
  title: string;
  occurred_at: string;
  created_at: string;
  read_at: string | null;
}
export interface NotificationPage {
  items: InboxNotification[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export class NotificationError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'setup'
      | 'forbidden'
      | 'not-found'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const notificationAccessError = (error: NotificationError) =>
  ['session', 'setup', 'forbidden'].includes(error.kind);
export function notificationError(error: unknown): NotificationError {
  if (error instanceof NotificationError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new NotificationError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new NotificationError(
    'unavailable',
    'Notifications could not be confirmed. Please try again.',
  );
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v !== '00000000-0000-0000-0000-000000000000' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const date = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const sourceKeys = {
  complaint: 'complaint_id',
  leave: 'leave_id',
  late_access: 'late_access_id',
  announcement: 'announcement_id',
  attendance: 'attendance_incident_id',
} as const;
function validNotification(v: unknown): v is InboxNotification {
  if (
    !record(v) ||
    !uuid(v.notification_id) ||
    typeof v.source_type !== 'string' ||
    !Object.hasOwn(sourceKeys, v.source_type)
  )
    return false;
  const source = v.source_type as InboxNotification['source_type'];
  if (
    !uuid(v[sourceKeys[source]]) ||
    Object.values(sourceKeys).some(
      (key) =>
        key !== sourceKeys[source] && v[key] !== undefined && v[key] !== '',
    )
  )
    return false;
  const allowed: Record<InboxNotification['source_type'], string[]> = {
    complaint: ['created', 'status'],
    leave: ['leave_submitted', 'leave_decided'],
    late_access: ['late_access_submitted', 'late_access_decided'],
    announcement: ['announcement_published'],
    attendance: ['attendance_incident'],
  };
  return (
    typeof v.kind === 'string' &&
    allowed[source].includes(v.kind) &&
    typeof v.title === 'string' &&
    Boolean(v.title.trim()) &&
    !/\p{Cc}/u.test(v.title) &&
    typeof v.status === 'string' &&
    Boolean(v.status) &&
    (v.category === undefined || typeof v.category === 'string') &&
    date(v.occurred_at) &&
    date(v.created_at) &&
    (v.read_at === null || date(v.read_at))
  );
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  read = false,
): Promise<unknown> {
  const response = await authorizedRequest(
    path,
    uid,
    signal,
    ...(read ? [{ method: 'POST' as const }] : []),
  );
  const value: unknown = await response.json().catch(() => null);
  if (response.status === 401)
    throw new NotificationError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403) {
    const setup = record(value) && value.error === 'setup_required';
    throw new NotificationError(
      setup ? 'setup' : 'forbidden',
      setup
        ? 'Complete your student account setup first.'
        : 'Your account cannot access this inbox.',
    );
  }
  if (response.status === 404)
    throw new NotificationError(
      'not-found',
      'This notification is no longer available within your current access. Refresh the inbox.',
    );
  if (response.status === 400)
    throw new NotificationError(
      'invalid',
      'The notification request is invalid. Refresh the inbox.',
    );
  if (response.status !== 200 || signal.aborted) throw notificationError(null);
  return value;
}
export async function listNotifications(
  uid: string,
  signal: AbortSignal,
  unread = false,
  offset = 0,
): Promise<NotificationPage> {
  try {
    if (!integer(offset) || offset > Number.MAX_SAFE_INTEGER - 20)
      throw new NotificationError('invalid', 'Choose a valid inbox page.');
    const value = await request(
      `/api/v1/notifications?limit=20&offset=${offset}&unread=${unread}`,
      uid,
      signal,
    );
    if (
      !record(value) ||
      !Array.isArray(value.items) ||
      !value.items.every(validNotification) ||
      !integer(value.total) ||
      value.limit !== 20 ||
      value.offset !== offset ||
      value.items.length !== Math.min(20, Math.max(0, value.total - offset)) ||
      value.has_more !== offset + value.items.length < value.total ||
      new Set(value.items.map((n) => n.notification_id)).size !==
        value.items.length ||
      (unread && value.items.some((n) => n.read_at !== null))
    )
      throw notificationError(null);
    return value as unknown as NotificationPage;
  } catch (error) {
    throw notificationError(error);
  }
}
export async function getUnreadCount(
  uid: string,
  signal: AbortSignal,
): Promise<number> {
  try {
    const value = await request(
      '/api/v1/notifications/unread-count',
      uid,
      signal,
    );
    if (!record(value) || !integer(value.unread)) throw notificationError(null);
    return value.unread;
  } catch (error) {
    throw notificationError(error);
  }
}
export async function markNotificationRead(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<InboxNotification> {
  try {
    if (!uuid(id))
      throw new NotificationError('invalid', 'Choose a valid notification.');
    const value = await request(
      `/api/v1/notifications/${id.toLowerCase()}/read`,
      uid,
      signal,
      true,
    );
    if (
      !validNotification(value) ||
      value.notification_id !== id.toLowerCase() ||
      value.read_at === null
    )
      throw notificationError(null);
    return value;
  } catch (error) {
    throw notificationError(error);
  }
}

// Build local, role-specific routes from validated IDs, never server-provided URLs.
export function notificationSource(
  row: InboxNotification,
  role: 'admin' | 'warden' | 'student',
): string | undefined {
  const base = role === 'student' ? '/student' : '/dashboard';
  switch (row.source_type) {
    case 'complaint':
      return `${base}/complaints/${row.complaint_id}`;
    case 'leave':
      return `${base}/leaves/${row.leave_id}`;
    case 'late_access':
      return `${base}/late-access-requests/${row.late_access_id}`;
    case 'announcement':
      return `${base}/announcements/${row.announcement_id}`;
    case 'attendance':
      return undefined;
  }
}
