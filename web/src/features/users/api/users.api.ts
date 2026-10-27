import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export const roles = [
  'admin',
  'warden',
  'sub_warden',
  'security_staff',
  'student',
] as const;
export type UserRole = (typeof roles)[number];
export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  warden: 'Warden',
  sub_warden: 'Sub-warden',
  security_staff: 'Security staff',
  student: 'Student',
};
export interface ManagedUser {
  user_id: string;
  firebase_uid: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  full_name?: string;
  designation?: string;
  student_profile_id?: string;
  student_profile_archived?: boolean;
  student_has_active_bed?: boolean;
}
export interface UserPage {
  users: ManagedUser[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export type AccountAction =
  { kind: 'role'; role: UserRole } | { kind: 'activate' | 'deactivate' };
export class UserManagementError extends Error {
  constructor(
    public readonly kind:
      | 'session'
      | 'forbidden'
      | 'invalid'
      | 'conflict'
      | 'missing'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new UserManagementError(
    'unavailable',
    'User management could not be confirmed. Please try again.',
  );
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validUser(value: unknown): value is ManagedUser {
  return (
    object(value) &&
    typeof value.user_id === 'string' &&
    uuid.test(value.user_id) &&
    typeof value.firebase_uid === 'string' &&
    value.firebase_uid.trim().length > 0 &&
    typeof value.email === 'string' &&
    value.email.trim().length > 0 &&
    roles.includes(value.role as UserRole) &&
    typeof value.is_active === 'boolean' &&
    (value.full_name === undefined || typeof value.full_name === 'string') &&
    (value.designation === undefined ||
      typeof value.designation === 'string') &&
    (value.student_profile_id === undefined
      ? value.student_profile_archived === undefined &&
        value.student_has_active_bed === undefined
      : value.role === 'student' &&
        typeof value.student_profile_id === 'string' &&
        uuid.test(value.student_profile_id) &&
        typeof value.student_profile_archived === 'boolean' &&
        typeof value.student_has_active_bed === 'boolean')
  );
}
export function userOffset(params: URLSearchParams): number | null {
  const value = params.get('offset') ?? '0';
  return [...params.keys()].every((key) => key === 'offset') &&
    params.getAll('offset').length <= 1 &&
    /^\d+$/.test(value) &&
    Number(value) <= 1000000
    ? Number(value)
    : null;
}
async function request(
  uid: string,
  signal: AbortSignal,
  path: string,
  action?: AccountAction,
) {
  let response: Response;
  try {
    response = await authorizedRequest(
      `/api/v1/users${path}`,
      uid,
      signal,
      action
        ? {
            method: action.kind === 'role' ? 'PATCH' : 'POST',
            ...(action.kind === 'role'
              ? {
                  body: JSON.stringify({ role: action.role }),
                  contentType: 'application/json',
                }
              : {}),
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new UserManagementError(
        'session',
        'Your session has expired. Please sign in again.',
      );
    throw unavailable();
  }
  if (response.status === 401)
    throw new UserManagementError(
      'session',
      'Your session has expired. Please sign in again.',
    );
  if (response.status === 403)
    throw new UserManagementError(
      'forbidden',
      'Admin access could not be confirmed. Account data has been hidden.',
    );
  if (response.status === 404)
    throw new UserManagementError(
      'missing',
      'This account is no longer available. Refresh the account list.',
    );
  if (response.status === 400)
    throw new UserManagementError(
      'invalid',
      'The account request was rejected. Refresh the list and review the values.',
    );
  if (response.status === 409) {
    const messages: Record<string, string> = {
      last_active_admin:
        'The last active Admin cannot be deactivated or changed to another role.',
      revocation_pending:
        'Session revocation is still processing. Wait, refresh the account list and try activation again.',
      provisioning_incomplete:
        'Account provisioning is incomplete. Activation cannot proceed yet.',
      firebase_identity_missing:
        'The Firebase identity is missing. Ask the account administrator to investigate.',
      firebase_identity_mismatch:
        'The Firebase identity does not match this account. Ask the account administrator to investigate.',
    };
    let code: unknown;
    try {
      const value: unknown = await response.json();
      code = object(value) ? value.error : undefined;
    } catch {
      /* Show a bounded generic conflict. */
    }
    throw new UserManagementError(
      'conflict',
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? messages[code]
        : 'The account change conflicts with its current state. Refresh and review the account.',
    );
  }
  if (
    response.status !== 200 &&
    !(action?.kind === 'deactivate' && response.status === 202)
  )
    throw unavailable();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw unavailable();
  }
}
export async function listUsers(
  uid: string,
  signal: AbortSignal,
  offset: number,
): Promise<UserPage> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000)
    throw new UserManagementError(
      'invalid',
      'Invalid page. Return to the first page.',
    );
  const value = await request(uid, signal, `?limit=20&offset=${offset}`);
  if (
    !object(value) ||
    !Array.isArray(value.users) ||
    !value.users.every(validUser) ||
    value.limit !== 20 ||
    value.offset !== offset ||
    typeof value.has_more !== 'boolean' ||
    value.users.length > 20 ||
    (value.has_more && value.users.length !== 20) ||
    new Set(value.users.map((row) => row.user_id)).size !==
      value.users.length ||
    new Set(value.users.map((row) => row.firebase_uid)).size !==
      value.users.length
  )
    throw unavailable();
  return value as unknown as UserPage;
}
export async function changeUser(
  uid: string,
  signal: AbortSignal,
  user: ManagedUser,
  action: AccountAction,
): Promise<{ account: ManagedUser; revocationPending: boolean }> {
  if (
    !validUser(user) ||
    !['role', 'activate', 'deactivate'].includes(action.kind) ||
    (action.kind === 'role' && !roles.includes(action.role))
  )
    throw new UserManagementError('invalid', 'Invalid account change.');
  const value = await request(
    uid,
    signal,
    `/${user.user_id}/${action.kind}`,
    action,
  );
  const account: unknown =
    action.kind === 'deactivate' && object(value) ? value.account : value;
  if (
    !validUser(account) ||
    account.user_id !== user.user_id ||
    account.firebase_uid !== user.firebase_uid ||
    (action.kind === 'role'
      ? account.role !== action.role
      : account.is_active !== (action.kind === 'activate')) ||
    (action.kind === 'deactivate' &&
      (!object(value) || typeof value.revocation_pending !== 'boolean'))
  )
    throw unavailable();
  return {
    account,
    revocationPending:
      action.kind === 'deactivate' &&
      object(value) &&
      value.revocation_pending === true,
  };
}
