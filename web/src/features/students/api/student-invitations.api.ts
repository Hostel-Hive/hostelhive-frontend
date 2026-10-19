import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import { StudentRequestError } from './students.api';
import type { StudentDetails } from '../student.types';

export type StudentInvitationInput = StudentDetails & {
  request_id: string;
  email: string;
};
export interface StudentInvitation {
  invitation_id: string;
  request_id: string;
  user_id: string;
  student_id: string;
  email: string;
  delivery_status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error?: string;
  created_at: string;
  last_requested_at: string;
  next_attempt_at: string | null;
  last_sent_at: string | null;
  setup_completed_at: string | null;
}
const uuid =
  /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validInvitation(value: unknown): value is StudentInvitation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ['invitation_id', 'request_id', 'user_id', 'student_id'].every(
      (k) => typeof v[k] === 'string' && uuid.test(v[k]),
    ) &&
    typeof v.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) &&
    ['pending', 'sent', 'failed', 'skipped'].includes(
      String(v.delivery_status),
    ) &&
    Number.isInteger(v.attempts) &&
    Number(v.attempts) >= 0 &&
    Number(v.attempts) <= 8 &&
    (v.last_error === undefined ||
      ['', 'identity_conflict', 'provider_unavailable', 'ineligible'].includes(
        String(v.last_error),
      )) &&
    timestamp(v.created_at) &&
    timestamp(v.last_requested_at) &&
    ['next_attempt_at', 'last_sent_at', 'setup_completed_at'].every(
      (k) => v[k] === null || timestamp(v[k]),
    )
  );
}
const unavailable = () =>
  new StudentRequestError(
    'unavailable',
    'Unable to confirm invitation registration. Retry the same registration to check its result.',
  );
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  input?: StudentInvitationInput,
) {
  let response: Response;
  try {
    response = await authorizedRequest(
      '/api/v1/student-invitations' + path,
      uid,
      signal,
      input
        ? {
            method: 'POST',
            body: JSON.stringify(input),
            contentType: 'application/json',
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new StudentRequestError(
        'session',
        'Your session has expired. Please sign in again.',
      );
    throw unavailable();
  }
  if (response.status === 401)
    throw new StudentRequestError(
      'session',
      'Your session has expired. Please sign in again.',
    );
  if (response.status === 403)
    throw new StudentRequestError(
      'forbidden',
      'Only an Admin can register a student invitation.',
    );
  if (response.status === 404)
    throw new StudentRequestError(
      'not-found',
      'This invitation could not be found.',
    );
  if (response.status === 409)
    throw new StudentRequestError(
      'duplicate',
      'This email, registration number or request conflicts with an existing registration. Check the student directory before registering again.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new StudentRequestError(
      'invalid',
      'Check the university email, registration number and profile details. The email must use a domain approved by your institution.',
    );
  if (!response.ok) throw unavailable();
  return response;
}
export async function registerStudentInvitation(
  input: StudentInvitationInput,
  uid: string,
  signal: AbortSignal,
) {
  if (!uuid.test(input.request_id))
    throw new StudentRequestError(
      'invalid',
      'A valid registration request ID is required.',
    );
  const response = await request('', uid, signal, input);
  const data: unknown = await response.json().catch(() => {
    throw unavailable();
  });
  if (
    typeof data !== 'object' ||
    data === null ||
    !('invitation' in data) ||
    !('replayed' in data) ||
    !validInvitation(data.invitation) ||
    typeof data.replayed !== 'boolean' ||
    data.invitation.request_id !== input.request_id ||
    data.invitation.email !== input.email ||
    (response.status !== 200 && response.status !== 201) ||
    data.replayed !== (response.status === 200)
  )
    throw unavailable();
  return { invitation: data.invitation, replayed: data.replayed };
}
export async function getStudentInvitation(
  id: string,
  uid: string,
  signal: AbortSignal,
) {
  if (!uuid.test(id))
    throw new StudentRequestError('invalid', 'Invalid invitation reference.');
  const response = await request('/' + id, uid, signal);
  const data: unknown = await response.json().catch(() => {
    throw unavailable();
  });
  if (!validInvitation(data) || data.invitation_id !== id) throw unavailable();
  return data;
}
