import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export interface Announcement {
  announcement_id: string;
  title: string;
  content: string;
  audience: 'all_students';
  priority: 'normal';
  published_by: string;
  published_at: string;
}
export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface PublicationInput {
  request_id: string;
  title: string;
  content: string;
  audience: 'all_students';
}
export interface DeliverySummary {
  announcement_id: string;
  recipients_total: number;
  delivered: number;
  pending_delivery: number;
  read: number;
  unread: number;
}
export class AnnouncementError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'setup'
      | 'forbidden'
      | 'not-found'
      | 'conflict'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const announcementAccessError = (error: AnnouncementError) =>
  error.kind === 'session' ||
  error.kind === 'setup' ||
  error.kind === 'forbidden';
export function announcementError(error: unknown): AnnouncementError {
  if (error instanceof AnnouncementError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new AnnouncementError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new AnnouncementError(
    'unavailable',
    'The announcement request could not be confirmed. Please try again.',
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value !== '00000000-0000-0000-0000-000000000000' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
function requireID(id: string) {
  if (!uuid(id))
    throw new AnnouncementError('invalid', 'Choose a valid announcement.');
}
function textOK(
  value: unknown,
  max: number,
  multiline: boolean,
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    Array.from(value).length <= max &&
    !/\p{Cc}/u.test(multiline ? value.replace(/[\r\n\t]/g, '') : value)
  );
}
export function publicationValidation(title: string, content: string): string {
  if (!textOK(title.trim(), 160, false))
    return 'Enter a single-line title of 1–160 characters without control characters.';
  if (!textOK(content.trim(), 5000, true))
    return 'Enter content of 1–5000 characters without unsupported control characters.';
  return '';
}
function validAnnouncement(value: unknown): value is Announcement {
  return (
    record(value) &&
    uuid(value.announcement_id) &&
    uuid(value.published_by) &&
    textOK(value.title, 160, false) &&
    textOK(value.content, 5000, true) &&
    value.audience === 'all_students' &&
    value.priority === 'normal' &&
    typeof value.published_at === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(
      value.published_at,
    ) &&
    Number.isFinite(Date.parse(value.published_at))
  );
}
async function checked(response: Response, statuses: number[]) {
  if (statuses.includes(response.status)) return response;
  const value: unknown = await response.json().catch(() => null);
  const code = record(value) ? value.error : undefined;
  if (response.status === 401)
    throw new AnnouncementError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new AnnouncementError(
      code === 'setup_required' ? 'setup' : 'forbidden',
      code === 'setup_required'
        ? 'Complete your student account setup first.'
        : 'Your account cannot access this announcement action.',
    );
  if (response.status === 404)
    throw new AnnouncementError(
      'not-found',
      'This announcement is unavailable or outside your current access.',
    );
  if (response.status === 409)
    throw new AnnouncementError(
      'conflict',
      'This publication reference conflicts with another request. Review existing announcements before preparing a new publication.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new AnnouncementError(
      'invalid',
      'Check the title and content. Only immediate announcements to all students are supported.',
    );
  throw announcementError(null);
}
export async function listAnnouncements(
  uid: string,
  signal: AbortSignal,
  offset = 0,
): Promise<AnnouncementPage> {
  try {
    if (!integer(offset) || offset > Number.MAX_SAFE_INTEGER - 20)
      throw new AnnouncementError(
        'invalid',
        'Choose a valid announcement page.',
      );
    const response = await checked(
      await authorizedRequest(
        `/api/v1/announcements?limit=20&offset=${offset}`,
        uid,
        signal,
      ),
      [200],
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      !Array.isArray(value.items) ||
      !value.items.every(validAnnouncement) ||
      !integer(value.total) ||
      value.offset !== offset ||
      value.limit !== 20 ||
      value.items.length !== Math.min(20, Math.max(0, value.total - offset)) ||
      value.has_more !== offset + value.items.length < value.total ||
      new Set(value.items.map((item) => item.announcement_id)).size !==
        value.items.length ||
      signal.aborted
    )
      throw announcementError(null);
    return {
      items: value.items,
      total: value.total,
      offset,
      limit: 20,
      has_more: value.has_more as boolean,
    };
  } catch (error) {
    throw announcementError(error);
  }
}
export async function getAnnouncement(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Announcement> {
  try {
    requireID(id);
    const response = await checked(
      await authorizedRequest(
        `/api/v1/announcements/${id.toLowerCase()}`,
        uid,
        signal,
      ),
      [200],
    );
    const value: unknown = await response.json();
    if (
      !validAnnouncement(value) ||
      value.announcement_id !== id.toLowerCase() ||
      signal.aborted
    )
      throw announcementError(null);
    return value;
  } catch (error) {
    throw announcementError(error);
  }
}
export async function getAnnouncementSummary(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<DeliverySummary> {
  try {
    requireID(id);
    const response = await checked(
      await authorizedRequest(
        `/api/v1/announcements/${id.toLowerCase()}/delivery-summary`,
        uid,
        signal,
      ),
      [200],
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      value.announcement_id !== id.toLowerCase() ||
      !integer(value.recipients_total) ||
      !integer(value.delivered) ||
      !integer(value.pending_delivery) ||
      !integer(value.read) ||
      !integer(value.unread) ||
      value.delivered + value.pending_delivery !== value.recipients_total ||
      value.read + value.unread !== value.delivered ||
      signal.aborted
    )
      throw announcementError(null);
    return {
      announcement_id: value.announcement_id as string,
      recipients_total: value.recipients_total,
      delivered: value.delivered,
      pending_delivery: value.pending_delivery,
      read: value.read,
      unread: value.unread,
    };
  } catch (error) {
    throw announcementError(error);
  }
}
export async function publishAnnouncement(
  input: PublicationInput,
  uid: string,
  userID: string,
  signal: AbortSignal,
): Promise<{ announcement: Announcement; replayed: boolean }> {
  try {
    requireID(input.request_id);
    requireID(userID);
    const validation = publicationValidation(input.title, input.content);
    if (validation || input.audience !== 'all_students')
      throw new AnnouncementError(
        'invalid',
        validation || 'Announcements must target all students.',
      );
    const payload: PublicationInput = {
      request_id: input.request_id.toLowerCase(),
      title: input.title.trim(),
      content: input.content.trim(),
      audience: 'all_students',
    };
    const response = await checked(
      await authorizedRequest('/api/v1/announcements', uid, signal, {
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify(payload),
      }),
      [200, 201],
    );
    const value: unknown = await response.json();
    if (
      !record(value) ||
      !validAnnouncement(value.announcement) ||
      value.announcement.title !== payload.title ||
      value.announcement.content !== payload.content ||
      value.announcement.published_by !== userID.toLowerCase() ||
      value.replayed !== (response.status === 200) ||
      signal.aborted
    )
      throw announcementError(null);
    return {
      announcement: value.announcement,
      replayed: value.replayed as boolean,
    };
  } catch (error) {
    throw announcementError(error);
  }
}
