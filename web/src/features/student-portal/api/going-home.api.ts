import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import { StudentPortalError } from './student-portal.api';
export interface GoingHomeDeclaration {
  going_home_id: string;
  request_id: string;
  student_id: string;
  submitted_by: string;
  status: 'declared' | 'departed';
  declared_at: string;
  departed_at: string | null;
  departure_device_id: string | null;
  departure_event_id: string | null;
}
export class GoingHomeError extends Error {
  constructor(
    public readonly uncertain: boolean,
    message: string,
  ) {
    super(message);
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    value,
  ) &&
  value !== '00000000-0000-0000-0000-000000000000';
const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export async function declareGoingHome(
  uid: string,
  studentID: string,
  requestID: string,
  signal: AbortSignal,
): Promise<GoingHomeDeclaration> {
  try {
    if (!uuid(studentID) || !uuid(requestID))
      throw new GoingHomeError(
        false,
        'Your student reference could not be verified. Refresh your profile.',
      );
    const response = await authorizedRequest(
      '/api/v1/going-home',
      uid,
      signal,
      {
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ request_id: requestID }),
      },
    );
    if (response.status === 401)
      throw new StudentPortalError(
        'session',
        'Your session has expired. Sign in again.',
      );
    if (response.status === 403)
      throw new StudentPortalError(
        'forbidden',
        'Your account is not eligible to declare Going Home. Verify account access.',
      );
    if (response.status === 400)
      throw new GoingHomeError(
        false,
        'The declaration was not accepted. Refresh your profile before trying again.',
      );
    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      const messages: Record<string, string> = {
        already_outside:
          'You are already recorded as OUT. A Going Home declaration requires a recorded IN status.',
        presence_unknown:
          'Your recorded presence is unknown. Contact hostel staff before declaring Going Home.',
        going_home_pending:
          'You already have an outstanding Going Home declaration. Scan at the exit gate when you leave.',
        active_student_required:
          'An active student profile is required. Contact your hostel administrator.',
        going_home_conflict:
          'This declaration conflicts with an existing record. Contact hostel staff before trying again.',
      };
      throw new GoingHomeError(
        false,
        messages[body?.error] ??
          'The declaration was not accepted. Check your current status with hostel staff.',
      );
    }
    if (response.status !== 200 && response.status !== 201)
      throw new Error('Unconfirmed');
    const value = (await response.json()) as GoingHomeDeclaration;
    if (
      !value ||
      !uuid(value.going_home_id) ||
      value.request_id !== requestID ||
      value.student_id !== studentID ||
      !uuid(value.submitted_by) ||
      !date(value.declared_at) ||
      !(value.status === 'declared'
        ? value.departed_at === null &&
          value.departure_device_id === null &&
          value.departure_event_id === null
        : value.status === 'departed' &&
          date(value.departed_at) &&
          uuid(value.departure_device_id) &&
          uuid(value.departure_event_id))
    )
      throw new Error('Unconfirmed');
    return value;
  } catch (error) {
    if (error instanceof GoingHomeError || error instanceof StudentPortalError)
      throw error;
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw new StudentPortalError('session', error.message);
    throw new GoingHomeError(
      true,
      'The result could not be confirmed. Your declaration may have been saved. Retry the same declaration to check it safely.',
    );
  }
}
