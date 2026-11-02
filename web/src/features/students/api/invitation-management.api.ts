import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  validInvitation,
  type StudentInvitation,
} from './student-invitations.api';
export interface InvitationPage {
  items: StudentInvitation[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export class InvitationError extends Error {
  constructor(
    public readonly kind:
      | 'session'
      | 'forbidden'
      | 'missing'
      | 'conflict'
      | 'invalid'
      | 'cooldown'
      | 'unavailable',
    message: string,
    public readonly retryAfterSeconds = 0,
  ) {
    super(message);
  }
}
const uuid = (v: string) =>
  /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
const unavailable = () =>
  new InvitationError(
    'unavailable',
    'The invitation request could not be confirmed. Check its current status before starting another resend.',
  );
export const invitationAccessDenied = (e: unknown): e is InvitationError =>
  e instanceof InvitationError &&
  (e.kind === 'session' || e.kind === 'forbidden');
export function resendWaitSeconds(row: StudentInvitation, now: number) {
  return Math.max(
    0,
    Math.ceil((Date.parse(row.last_requested_at) + 300000 - now) / 1000),
  );
}
function retryAfter(value: string | null) {
  const seconds =
    value && /^\d+$/.test(value)
      ? Number(value)
      : value
        ? Math.ceil((Date.parse(value) - Date.now()) / 1000)
        : NaN;
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400
    ? seconds
    : 300;
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  requestID?: string,
) {
  let response: Response;
  try {
    response = await authorizedRequest(
      '/api/v1/student-invitations' + path,
      uid,
      signal,
      requestID
        ? {
            method: 'POST',
            contentType: 'application/json',
            body: JSON.stringify({ request_id: requestID }),
          }
        : undefined,
    );
  } catch (e) {
    if (e instanceof AuthorizedRequestError && e.kind === 'session')
      throw new InvitationError(
        'session',
        'Your session has expired. Sign in again.',
      );
    throw unavailable();
  }
  if (response.status === 401)
    throw new InvitationError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new InvitationError(
      'forbidden',
      'Only an active Admin can manage student invitations.',
    );
  if (response.status === 404)
    throw new InvitationError(
      'missing',
      'This invitation could not be found. Refresh the directory.',
    );
  if (response.status === 409)
    throw new InvitationError(
      'conflict',
      'This invitation is no longer eligible for a new resend, or this request conflicts with an earlier operation. Check account setup and student status.',
    );
  if (response.status === 429)
    throw new InvitationError(
      'cooldown',
      'Please wait before retrying this invitation resend.',
      retryAfter(response.headers.get('Retry-After')),
    );
  if ([400, 413, 415].includes(response.status))
    throw new InvitationError(
      'invalid',
      'The invitation request was rejected. Refresh its details before trying again.',
    );
  if (response.status !== 200) throw unavailable();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw unavailable();
  }
}
export async function listStudentInvitations(
  uid: string,
  offset: number,
  signal: AbortSignal,
): Promise<InvitationPage> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
    throw new InvitationError('invalid', 'Invalid invitation page.');
  const value = (await request(
    `?limit=20&offset=${offset}`,
    uid,
    signal,
  )) as InvitationPage | null;
  if (
    !value ||
    !Array.isArray(value.items) ||
    !value.items.every(validInvitation) ||
    value.items.length > 20 ||
    value.limit !== 20 ||
    value.offset !== offset ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    typeof value.has_more !== 'boolean' ||
    value.items.length > Math.max(0, value.total - offset) ||
    value.has_more !== offset + value.items.length < value.total ||
    new Set(value.items.map((r) => r.invitation_id)).size !== value.items.length
  )
    throw unavailable();
  return value;
}
export async function readStudentInvitation(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<StudentInvitation> {
  if (!uuid(id))
    throw new InvitationError('invalid', 'Invalid invitation reference.');
  const value = await request('/' + id, uid, signal);
  if (
    !validInvitation(value) ||
    value.invitation_id.toLowerCase() !== id.toLowerCase()
  )
    throw unavailable();
  return value;
}
export async function resendStudentInvitation(
  id: string,
  requestID: string,
  uid: string,
  signal: AbortSignal,
): Promise<StudentInvitation> {
  if (!uuid(id) || !uuid(requestID))
    throw new InvitationError(
      'invalid',
      'Invalid invitation or resend request reference.',
    );
  const value = await request('/' + id + '/resend', uid, signal, requestID);
  if (
    !validInvitation(value) ||
    value.invitation_id.toLowerCase() !== id.toLowerCase()
  )
    throw unavailable();
  return value;
}
