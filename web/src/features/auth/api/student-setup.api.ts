import {
  authorizedRequest,
  AuthorizedRequestError,
} from './authorized-request';

export class StudentSetupError extends Error {
  constructor(
    public readonly kind: 'session' | 'pending' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

export async function completeStudentSetup(uid: string, signal: AbortSignal) {
  try {
    const response = await authorizedRequest(
      '/api/v1/me/setup/complete',
      uid,
      signal,
      { method: 'POST' },
    );
    if (response.status === 401 || response.status === 403)
      throw new StudentSetupError(
        'session',
        'Your account cannot complete setup in this session. Sign in again or contact your hostel administrator.',
      );
    if (response.status === 409)
      throw new StudentSetupError(
        'pending',
        'Setup has not been verified. Finish the password setup from your invitation email, then sign in again with your new password. A recent password sign-in is required.',
      );
    if (!response.ok) throw new Error('Unavailable');
    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('setup_required' in result) ||
      result.setup_required !== false ||
      !('setup_completed_at' in result) ||
      (result.setup_completed_at !== null &&
        (typeof result.setup_completed_at !== 'string' ||
          !Number.isFinite(Date.parse(result.setup_completed_at))))
    )
      throw new Error('Invalid setup response');
  } catch (error) {
    if (error instanceof StudentSetupError) throw error;
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new StudentSetupError('session', error.message);
    throw new StudentSetupError(
      'unavailable',
      'Unable to verify account setup. Please retry. If you did not receive an invitation, contact your hostel administrator.',
    );
  }
}
