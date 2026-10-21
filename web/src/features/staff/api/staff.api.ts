import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import { roles, type UserRole } from '../../users/api/users.api';

export interface StaffProfile {
  staff_id: string;
  user_id: string;
  full_name: string;
  designation: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface StaffPage {
  staff: StaffProfile[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface StaffDetails {
  full_name: string;
  designation: string;
}
export class StaffError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'missing'
      | 'conflict'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new StaffError(
    'unavailable',
    'Staff profiles could not be confirmed. Please try again.',
  );
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const staffUUID = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}
export function validStaff(value: unknown): value is StaffProfile {
  return (
    object(value) &&
    typeof value.staff_id === 'string' &&
    staffUUID(value.staff_id) &&
    typeof value.user_id === 'string' &&
    staffUUID(value.user_id) &&
    typeof value.full_name === 'string' &&
    typeof value.designation === 'string' &&
    typeof value.email === 'string' &&
    value.email.trim().length > 0 &&
    roles.includes(value.role as UserRole) &&
    typeof value.is_active === 'boolean' &&
    timestamp(value.created_at) &&
    timestamp(value.updated_at)
  );
}
export function staffOffset(params: URLSearchParams): number | null {
  const raw = params.get('offset') ?? '0';
  return [...params.keys()].every((key) => key === 'offset') &&
    params.getAll('offset').length <= 1 &&
    /^\d+$/.test(raw) &&
    Number(raw) <= 100000
    ? Number(raw)
    : null;
}
export function normalizeStaff(value: StaffDetails): StaffDetails {
  return {
    full_name: value.full_name.trim(),
    designation: value.designation.trim(),
  };
}
export function validateStaff(
  value: StaffDetails,
): Partial<Record<keyof StaffDetails, string>> {
  const input = normalizeStaff(value);
  const errors: Partial<Record<keyof StaffDetails, string>> = {};
  for (const [key, label, max] of [
    ['full_name', 'Full name', 200],
    ['designation', 'Designation', 120],
  ] as const) {
    if (
      !input[key] ||
      [...input[key]].length > max ||
      /[\p{Cc}\p{Cs}]/u.test(input[key])
    )
      errors[key] =
        `${label} is required, up to ${max} characters, without control characters.`;
  }
  return errors;
}
export function staffAccessError(error: unknown) {
  return (
    error instanceof StaffError &&
    (error.kind === 'session' || error.kind === 'forbidden')
  );
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  details?: StaffDetails,
): Promise<unknown> {
  let response: Response;
  try {
    response = await authorizedRequest(
      `/api/v1/staff${path}`,
      uid,
      signal,
      details
        ? {
            method: 'PUT',
            body: JSON.stringify(details),
            contentType: 'application/json',
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new StaffError(
        'session',
        'Your session has expired. Please sign in again.',
      );
    throw unavailable();
  }
  if (response.status === 401)
    throw new StaffError(
      'session',
      'Your session has expired. Please sign in again.',
    );
  if (response.status === 403)
    throw new StaffError(
      'forbidden',
      'Admin access could not be confirmed. Staff data has been hidden.',
    );
  if (response.status === 404)
    throw new StaffError(
      'missing',
      'Staff profile not found. Return to the directory or refresh the profile.',
    );
  if (response.status === 409)
    throw new StaffError(
      'conflict',
      'This account must have a staff role before its profile can be updated. Review the account in User management.',
    );
  if (response.status === 400)
    throw new StaffError(
      'invalid',
      'The staff request was rejected. Check the full name and designation or refresh the profile.',
    );
  if (response.status !== 200) throw unavailable();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw unavailable();
  }
}
export async function listStaff(
  uid: string,
  signal: AbortSignal,
  offset: number,
): Promise<StaffPage> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new StaffError(
      'invalid',
      'Invalid staff page. Return to the first page.',
    );
  const value = await request(`?limit=20&offset=${offset}`, uid, signal);
  if (
    !object(value) ||
    !Array.isArray(value.staff) ||
    !value.staff.every(validStaff) ||
    value.limit !== 20 ||
    value.offset !== offset ||
    typeof value.has_more !== 'boolean' ||
    value.staff.length > 20 ||
    (value.has_more && value.staff.length !== 20) ||
    new Set(value.staff.map((row) => row.user_id)).size !==
      value.staff.length ||
    new Set(value.staff.map((row) => row.staff_id)).size !== value.staff.length
  )
    throw unavailable();
  return value as unknown as StaffPage;
}
export async function getStaff(
  userID: string,
  uid: string,
  signal: AbortSignal,
): Promise<StaffProfile> {
  if (!staffUUID(userID))
    throw new StaffError(
      'invalid',
      'Invalid staff account ID. Return to the directory.',
    );
  const value = await request(`/${userID}`, uid, signal);
  if (!validStaff(value) || value.user_id !== userID) throw unavailable();
  return value;
}
export async function saveStaff(
  profile: StaffProfile,
  details: StaffDetails,
  uid: string,
  signal: AbortSignal,
): Promise<StaffProfile> {
  const normalized = normalizeStaff(details);
  if (!validStaff(profile) || Object.keys(validateStaff(details)).length)
    throw new StaffError(
      'invalid',
      'Check the full name and designation before saving.',
    );
  const value = await request(`/${profile.user_id}`, uid, signal, normalized);
  if (
    !validStaff(value) ||
    value.user_id !== profile.user_id ||
    value.staff_id !== profile.staff_id ||
    value.full_name !== normalized.full_name ||
    value.designation !== normalized.designation
  )
    throw unavailable();
  return value;
}
export async function createStaffProfile(
  userID: string,
  details: StaffDetails,
  uid: string,
  signal: AbortSignal,
): Promise<StaffProfile> {
  const normalized = normalizeStaff(details);
  if (!staffUUID(userID) || Object.keys(validateStaff(details)).length)
    throw new StaffError(
      'invalid',
      'Check the full name and designation before creating the profile.',
    );
  const value = await request(`/${userID}`, uid, signal, normalized);
  if (
    !validStaff(value) ||
    value.user_id !== userID ||
    value.role === 'student' ||
    value.full_name !== normalized.full_name ||
    value.designation !== normalized.designation
  )
    throw unavailable();
  return value;
}
