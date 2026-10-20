import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type { OwnStudentProfile } from '../student-portal.types';

export class StudentPortalError extends Error {
  constructor(
    public readonly kind:
      'session' | 'forbidden' | 'setup' | 'not-found' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function portalError(error: unknown): StudentPortalError {
  if (error instanceof StudentPortalError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new StudentPortalError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new StudentPortalError(
    'unavailable',
    'Unable to load student information. Please try again.',
  );
}
export function isAccessError(error: StudentPortalError) {
  return ['session', 'forbidden', 'setup'].includes(error.kind);
}

async function ownResponse(path: string, uid: string, signal: AbortSignal) {
  try {
    const response = await authorizedRequest(path, uid, signal);
    if (response.status === 401)
      throw new StudentPortalError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (response.status === 403) {
      const body: unknown = await response.json().catch(() => null);
      const setup =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        body.error === 'setup_required';
      throw new StudentPortalError(
        setup ? 'setup' : 'forbidden',
        setup
          ? 'Account setup must be completed before opening your student dashboard.'
          : 'Your account no longer has access to this student information.',
      );
    }
    if (response.status === 404)
      throw new StudentPortalError(
        'not-found',
        'Student information is not available. Your profile may not be linked or may have been archived. Contact your hostel administrator.',
      );
    if (response.status !== 200) throw new Error('Unavailable');
    return response;
  } catch (error) {
    throw portalError(error);
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === 'string');
const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^(?!00000000-0000-0000-0000-000000000000)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validOwnProfile(value: unknown): value is OwnStudentProfile {
  if (
    !record(value) ||
    !uuid(value.student_id) ||
    !strings(value, [
      'index_no',
      'full_name',
      'faculty',
      'contact_phone',
      'email',
    ]) ||
    !Number.isInteger(value.year) ||
    !Array.isArray(value.guardians) ||
    !value.guardians.every(
      (g) =>
        record(g) &&
        uuid(g.guardian_id) &&
        strings(g, ['name', 'relationship', 'contact_phone']),
    ) ||
    (value.profile_image_url !== null &&
      value.profile_image_url !== '/api/v1/me/student-profile/image')
  )
    return false;
  if (value.accommodation !== null) {
    const a = value.accommodation;
    if (
      !record(a) ||
      !['allocation_id', 'block_id', 'room_id', 'bed_id'].every((key) =>
        uuid(a[key]),
      ) ||
      !strings(a, ['block_name', 'room_no', 'bed_no']) ||
      !timestamp(a.started_at)
    )
      return false;
  }
  const p = value.presence;
  return (
    record(p) &&
    ((p.status === 'UNKNOWN' && p.updated_at === null) ||
      ((p.status === 'IN' || p.status === 'OUT') && timestamp(p.updated_at)))
  );
}
export async function getOwnProfile(
  uid: string,
  signal: AbortSignal,
): Promise<OwnStudentProfile> {
  try {
    const response = await ownResponse(
      '/api/v1/me/student-profile',
      uid,
      signal,
    );
    const value: unknown = await response.json();
    if (!validOwnProfile(value)) throw new Error('Invalid profile');
    if (signal.aborted) throw new Error('Aborted');
    return value;
  } catch (error) {
    throw portalError(error);
  }
}

async function ownImage(
  path: string,
  uid: string,
  signal: AbortSignal,
  qr: boolean,
) {
  try {
    const response = await ownResponse(path, uid, signal);
    const type = response.headers
      .get('Content-Type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (type !== 'image/png' && (qr || type !== 'image/jpeg'))
      throw new Error('Invalid image');
    const length = Number(response.headers.get('Content-Length'));
    if (length > 5 * 1024 * 1024) throw new Error('Image too large');
    const bytes = await response.arrayBuffer();
    const data = new Uint8Array(bytes);
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.byteLength > 5 * 1024 * 1024 ||
      (type === 'image/png'
        ? bytes.byteLength <= 8 || !png.every((byte, i) => data[i] === byte)
        : bytes.byteLength < 4 ||
          data[0] !== 255 ||
          data[1] !== 216 ||
          data[2] !== 255)
    )
      throw new Error('Invalid image');
    if (signal.aborted) throw new Error('Aborted');
    return new Blob([bytes], { type });
  } catch (error) {
    throw portalError(error);
  }
}
export const getOwnPhoto = (uid: string, signal: AbortSignal) =>
  ownImage('/api/v1/me/student-profile/image', uid, signal, false);
export const getOwnQR = (uid: string, signal: AbortSignal) =>
  ownImage('/api/v1/me/qr', uid, signal, true);
