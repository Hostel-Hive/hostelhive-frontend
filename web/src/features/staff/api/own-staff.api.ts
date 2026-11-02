import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type { StaffAccount } from '../../auth/auth.types';
import { StaffError, staffUUID, validStaff } from './staff.api';
export interface OwnStaffProfile {
  full_name: string;
  designation: string;
  email: string;
  role: StaffAccount['role'];
}
export function staffNameError(value: string) {
  const name = value.trim();
  if (!name || Array.from(name).length > 200 || /[\p{Cc}\p{Cs}]/u.test(name))
    return 'Enter a full name of 1–200 characters without control characters.';
}
const unavailable = () =>
  new StaffError(
    'unavailable',
    'Your profile request could not be confirmed. Check your current profile before trying again.',
  );
async function request(
  account: StaffAccount,
  signal: AbortSignal,
  name?: string,
): Promise<unknown> {
  if (
    !staffUUID(account.user_id) ||
    !['admin', 'warden'].includes(account.role) ||
    !account.is_active
  )
    throw new StaffError(
      'forbidden',
      'Your staff account could not be verified. Verify your account to continue.',
    );
  let response: Response;
  try {
    response = await authorizedRequest(
      name === undefined ? '/api/v1/me' : '/api/v1/staff/me',
      account.firebase_uid,
      signal,
      name === undefined
        ? undefined
        : {
            method: 'PUT',
            contentType: 'application/json',
            body: JSON.stringify({ full_name: name.trim() }),
          },
    );
  } catch (e) {
    if (e instanceof AuthorizedRequestError && e.kind === 'session')
      throw new StaffError(
        'session',
        'Your session has expired. Sign in again.',
      );
    throw unavailable();
  }
  if (response.status === 401)
    throw new StaffError('session', 'Your session has expired. Sign in again.');
  if (response.status === 403)
    throw new StaffError(
      'forbidden',
      'Your account no longer has access to staff self-service. Verify your account.',
    );
  if (response.status === 400)
    throw new StaffError('invalid', 'Check your full name before saving.');
  if (response.status === 409)
    throw new StaffError(
      'conflict',
      'Your account no longer has an eligible staff role. Verify your account.',
    );
  if (response.status !== 200) throw unavailable();
  try {
    return await response.json();
  } catch {
    throw unavailable();
  }
}
export async function getOwnStaffProfile(
  account: StaffAccount,
  signal: AbortSignal,
): Promise<OwnStaffProfile> {
  const value = await request(account, signal);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw unavailable();
  const v = value as Record<string, unknown>;
  if (
    v.user_id !== account.user_id ||
    v.firebase_uid !== account.firebase_uid ||
    v.email !== account.email ||
    v.role !== account.role ||
    v.is_active !== true ||
    v.setup_required === true
  )
    throw new StaffError(
      'forbidden',
      'Your account details changed. Verify your account before continuing.',
    );
  if (
    (v.full_name !== undefined &&
      (typeof v.full_name !== 'string' ||
        (v.full_name !== '' && staffNameError(v.full_name)))) ||
    (v.designation !== undefined && typeof v.designation !== 'string')
  )
    throw unavailable();
  return {
    full_name: (v.full_name as string) ?? '',
    designation: (v.designation as string) ?? '',
    email: account.email,
    role: account.role,
  };
}
export async function updateOwnStaffName(
  account: StaffAccount,
  fullName: string,
  signal: AbortSignal,
): Promise<OwnStaffProfile> {
  const invalid = staffNameError(fullName);
  if (invalid) throw new StaffError('invalid', invalid);
  const v = await request(account, signal, fullName);
  if (
    !validStaff(v) ||
    v.user_id !== account.user_id ||
    v.email !== account.email ||
    v.full_name !== fullName.trim() ||
    !v.is_active
  )
    throw unavailable();
  if (v.role !== account.role)
    throw new StaffError(
      'forbidden',
      'Your staff role changed. Verify your account before continuing.',
    );
  return {
    full_name: v.full_name,
    designation: v.designation,
    email: v.email,
    role: account.role,
  };
}
