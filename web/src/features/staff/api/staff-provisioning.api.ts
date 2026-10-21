import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  validUser,
  type ManagedUser,
  type UserRole,
} from '../../users/api/users.api';
import { normalizeStaff, validateStaff, type StaffDetails } from './staff.api';

export const staffRoles = [
  'admin',
  'warden',
  'sub_warden',
  'security_staff',
] as const;
export type StaffRole = (typeof staffRoles)[number];
export const isStaffRole = (role: UserRole): role is StaffRole =>
  (staffRoles as readonly string[]).includes(role);
export interface StaffAccountInput {
  email: string;
  role: StaffRole;
  password: string;
}
export interface StaffRecovery extends StaffDetails {
  key: string;
  email: string;
  role: StaffRole;
  account?: ManagedUser;
}
export class ProvisionError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'conflict'
      | 'session'
      | 'forbidden'
      | 'unavailable'
      | 'storage',
    message: string,
  ) {
    super(message);
  }
}
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function validateAccount(input: StaffAccountInput) {
  const errors: Partial<Record<keyof StaffAccountInput, string>> = {};
  const email = normalizeEmail(input.email);
  if (
    !/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/u.test(email) ||
    new TextEncoder().encode(email).length > 254
  )
    errors.email = 'Enter a valid email address, up to 254 bytes.';
  if (!isStaffRole(input.role)) errors.role = 'Choose a supported staff role.';
  if (
    [...input.password].length < 12 ||
    [...input.password].length > 128 ||
    /\p{Cs}/u.test(input.password)
  )
    errors.password = 'The initial password must contain 12–128 characters.';
  return errors;
}
const keyPattern = /^[A-Za-z0-9_-]{8,128}$/;
export async function provisionStaff(
  input: StaffAccountInput,
  key: string,
  uid: string,
  signal: AbortSignal,
): Promise<{ account: ManagedUser; replayed: boolean }> {
  if (Object.keys(validateAccount(input)).length || !keyPattern.test(key))
    throw new ProvisionError(
      'invalid',
      'Check the account details before submitting.',
    );
  let response: Response;
  try {
    response = await authorizedRequest('/api/v1/users', uid, signal, {
      method: 'POST',
      contentType: 'application/json',
      idempotencyKey: key,
      body: JSON.stringify({
        email: normalizeEmail(input.email),
        role: input.role,
        password: input.password,
      }),
    });
  } catch (error) {
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new ProvisionError(
        'session',
        'Your session has expired. Sign in again to recover this setup.',
      );
    throw new ProvisionError(
      'unavailable',
      'Account creation could not be confirmed. Retry this same request; do not start a second account.',
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new ProvisionError(
      response.status === 401 ? 'session' : 'forbidden',
      'Admin access could not be confirmed. Setup details have been hidden.',
    );
  if (response.status === 400)
    throw new ProvisionError(
      'invalid',
      'The account details were rejected. Review the email, role and password.',
    );
  if (response.status === 409)
    throw new ProvisionError(
      'conflict',
      'This email or request conflicts with an existing account or identity. Check User management and use an existing staff account where appropriate.',
    );
  const unavailable = () =>
    new ProvisionError(
      'unavailable',
      'Account creation is pending or could not be confirmed. Retry the original request with the same password and request key.',
    );
  if (response.status !== 200 && response.status !== 201) throw unavailable();
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw unavailable();
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('account' in value) ||
    !validUser(value.account) ||
    !('replayed' in value) ||
    typeof value.replayed !== 'boolean' ||
    value.account.email !== normalizeEmail(input.email) ||
    value.replayed !== (response.status === 200) ||
    (!value.replayed &&
      (value.account.role !== input.role || !value.account.is_active))
  )
    throw unavailable();
  return { account: value.account, replayed: value.replayed };
}
const storageKey = (uid: string) => `hostelhive:staff-setup:${uid}`;
export function readStaffRecovery(uid: string): StaffRecovery | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error();
    const record = value as StaffRecovery;
    if (
      typeof record.key !== 'string' ||
      !keyPattern.test(record.key) ||
      typeof record.email !== 'string' ||
      !isStaffRole(record.role) ||
      typeof record.full_name !== 'string' ||
      typeof record.designation !== 'string' ||
      Object.keys(
        validateAccount({
          email: record.email,
          role: record.role,
          password: 'validation-only-password',
        }),
      ).length ||
      Object.keys(validateStaff(record)).length ||
      (record.account !== undefined &&
        (!validUser(record.account) || record.account.email !== record.email))
    )
      throw new Error();
    return {
      key: record.key,
      email: record.email,
      role: record.role,
      ...normalizeStaff(record),
      ...(record.account ? { account: record.account } : {}),
    };
  } catch {
    throw new ProvisionError(
      'storage',
      'Saved staff setup could not be read safely. Check User management before starting another account.',
    );
  }
}
export function writeStaffRecovery(uid: string, record: StaffRecovery) {
  try {
    sessionStorage.setItem(
      storageKey(uid),
      JSON.stringify({
        key: record.key,
        email: record.email,
        role: record.role,
        ...normalizeStaff(record),
        ...(record.account
          ? {
              account: {
                user_id: record.account.user_id,
                firebase_uid: record.account.firebase_uid,
                email: record.account.email,
                role: record.account.role,
                is_active: record.account.is_active,
              },
            }
          : {}),
      }),
    );
  } catch {
    throw new ProvisionError(
      'storage',
      'Browser session storage is unavailable. No new account request was started. Enable session storage and try again.',
    );
  }
}
export function clearStaffRecovery(uid: string) {
  try {
    sessionStorage.removeItem(storageKey(uid));
  } catch {
    /* A retained key remains safe to replay. */
  }
}
