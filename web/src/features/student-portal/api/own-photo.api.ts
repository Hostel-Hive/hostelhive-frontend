import {
  authorizedRequest,
  type AuthorizedInput,
} from '../../auth/api/authorized-request';
import { MAX_PHOTO_BYTES } from '../../students/student-image';
import {
  isAccessError,
  portalError,
  StudentPortalError,
} from './student-portal.api';

const path = '/api/v1/me/student-profile/image';
export class OwnPhotoInputError extends Error {}

async function write(
  uid: string,
  signal: AbortSignal,
  input: AuthorizedInput,
): Promise<Response> {
  try {
    const response = await authorizedRequest(path, uid, signal, input);
    if ([400, 413, 415].includes(response.status))
      throw new OwnPhotoInputError(
        'Choose a valid JPEG or PNG photo up to 5 MiB, with at most 4096 pixels per side and 12 million pixels.',
      );
    if (response.status === 401)
      throw new StudentPortalError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (response.status === 403) {
      const body: unknown = await response.json().catch(() => null);
      const setup =
        body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error === 'setup_required';
      throw new StudentPortalError(
        setup ? 'setup' : 'forbidden',
        'Your account cannot update this profile photo. Verify your account access.',
      );
    }
    if (response.status === 404)
      throw new StudentPortalError(
        'not-found',
        'Your student profile is unavailable. Contact your hostel administrator.',
      );
    if (
      response.status !== (input.method === 'PUT' ? 200 : 204) ||
      signal.aborted
    )
      throw new Error('Unconfirmed photo update');
    return response;
  } catch (reason) {
    if (reason instanceof OwnPhotoInputError) throw reason;
    const error = portalError(reason);
    if (isAccessError(error) || error.kind === 'not-found') throw error;
    throw new StudentPortalError(
      'unavailable',
      'The photo update could not be confirmed. Check the current profile before trying again. Photo storage may be unavailable.',
    );
  }
}

export async function uploadOwnPhoto(
  file: File,
  studentID: string,
  uid: string,
  signal: AbortSignal,
): Promise<void> {
  if (
    !['image/jpeg', 'image/png'].includes(file.type) ||
    !file.size ||
    file.size > MAX_PHOTO_BYTES
  )
    throw new OwnPhotoInputError(
      'Choose a non-empty JPEG or PNG photo up to 5 MiB.',
    );
  const response = await write(uid, signal, {
    method: 'PUT',
    body: file,
    contentType: file.type,
  });
  const value: unknown = await response.json().catch(() => null);
  if (
    !value ||
    typeof value !== 'object' ||
    !('student_id' in value) ||
    value.student_id !== studentID ||
    !('profile_image_url' in value) ||
    value.profile_image_url !== path ||
    signal.aborted
  )
    throw new StudentPortalError(
      'unavailable',
      'The photo update could not be verified. Check the current profile before trying again.',
    );
}

export async function removeOwnPhoto(
  uid: string,
  signal: AbortSignal,
): Promise<void> {
  await write(uid, signal, { method: 'DELETE' });
}
