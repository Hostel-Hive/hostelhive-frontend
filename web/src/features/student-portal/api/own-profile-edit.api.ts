import { authorizedRequest } from '../../auth/api/authorized-request';
import {
  isAccessError,
  portalError,
  StudentPortalError,
  validOwnProfile,
} from './student-portal.api';
import type { OwnStudentProfile } from '../student-portal.types';

export type GuardianInput = Pick<
  OwnStudentProfile['guardians'][number],
  'name' | 'relationship' | 'contact_phone'
>;
export interface OwnProfilePatch {
  contact_phone?: string;
  guardians?: GuardianInput[];
}
export class OwnProfileInputError extends Error {}

export async function patchOwnProfile(
  input: OwnProfilePatch,
  expectedStudentID: string,
  uid: string,
  signal: AbortSignal,
): Promise<OwnStudentProfile> {
  // Only supported editable fields are serialized, never profile/account IDs or
  // a copy of the GET aggregate. Ownership is resolved by the server.
  const body = JSON.stringify({
    ...(input.contact_phone !== undefined
      ? { contact_phone: input.contact_phone.trim() }
      : {}),
    ...(input.guardians !== undefined
      ? {
          guardians: input.guardians.map((guardian) => ({
            name: guardian.name.trim(),
            relationship: guardian.relationship.trim(),
            contact_phone: guardian.contact_phone.trim(),
          })),
        }
      : {}),
  });
  if (body === '{}' || new TextEncoder().encode(body).length > 16 * 1024)
    throw new OwnProfileInputError(
      'Provide changed contact details within the supported size limit.',
    );
  try {
    const response = await authorizedRequest(
      '/api/v1/me/student-profile',
      uid,
      signal,
      { method: 'PATCH', contentType: 'application/json', body },
    );
    if ([400, 413, 415].includes(response.status))
      throw new OwnProfileInputError(
        'The update was rejected. Check your phone and guardian details.',
      );
    if (response.status === 401)
      throw new StudentPortalError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (response.status === 403) {
      const value: unknown = await response.json().catch(() => null);
      const setup =
        value &&
        typeof value === 'object' &&
        'error' in value &&
        value.error === 'setup_required';
      throw new StudentPortalError(
        setup ? 'setup' : 'forbidden',
        'Your account no longer has access to edit this profile. Verify account access.',
      );
    }
    if (response.status === 404)
      throw new StudentPortalError(
        'not-found',
        'Your student profile is unavailable. Contact your hostel administrator.',
      );
    if (response.status !== 200) throw new Error('Unconfirmed update');
    const profile: unknown = await response.json();
    if (
      !validOwnProfile(profile) ||
      profile.student_id !== expectedStudentID ||
      signal.aborted
    )
      throw new Error('Unconfirmed update');
    return profile;
  } catch (reason) {
    if (reason instanceof OwnProfileInputError) throw reason;
    const error = portalError(reason);
    if (isAccessError(error) || error.kind === 'not-found') throw error;
    throw new StudentPortalError(
      'unavailable',
      'The update could not be confirmed. It may have saved. Check your current profile before editing again.',
    );
  }
}
