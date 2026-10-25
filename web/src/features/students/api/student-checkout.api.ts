import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export const checkoutReasons = {
  graduated: 'Graduated',
  withdrawn: 'Withdrawn from hostel',
  moved_out: 'Moved out permanently',
  accommodation_cancelled: 'Accommodation cancelled',
  other: 'Other permanent departure',
};
export interface CheckoutInput {
  request_id: string;
  reason: keyof typeof checkoutReasons;
  notes: string;
  deactivate_account: boolean;
  confirmed: true;
}
export interface CheckoutResult {
  replayed: boolean;
  revocation_pending: boolean;
  checkout: {
    checkout_id: string;
    request_id: string;
    student_id: string;
    user_id: string;
    reason: string;
    notes: string;
    deactivate_account: boolean;
    account_active_after: boolean;
    profile_was_archived: boolean;
    archived_at: string;
    released_allocation_id: string | null;
    released_bed_id: string | null;
    performed_by: string;
    performed_at: string;
  };
}
export class CheckoutError extends Error {
  constructor(
    public readonly kind:
      | 'session'
      | 'forbidden'
      | 'invalid'
      | 'not-found'
      | 'conflict'
      | 'already-ended'
      | 'account'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v) &&
  v !== '00000000-0000-0000-0000-000000000000';
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
const unavailable = () =>
  new CheckoutError(
    'unavailable',
    'The checkout result could not be confirmed. Retry the same checkout to check its original result.',
  );
export function checkoutError(reason: unknown) {
  if (reason instanceof CheckoutError) return reason;
  if (reason instanceof AuthorizedRequestError)
    return new CheckoutError(reason.kind, reason.message);
  return unavailable();
}
export async function checkoutStudent(
  studentID: string,
  userID: string,
  uid: string,
  input: CheckoutInput,
  signal: AbortSignal,
): Promise<CheckoutResult> {
  if (
    !uuid(studentID) ||
    !uuid(userID) ||
    !uuid(input.request_id) ||
    !Object.hasOwn(checkoutReasons, input.reason) ||
    input.confirmed !== true ||
    typeof input.deactivate_account !== 'boolean' ||
    typeof input.notes !== 'string' ||
    [...input.notes].length > 1000 ||
    [...input.notes].some((c) => {
      const n = c.codePointAt(0)!;
      return n < 32 || (n >= 127 && n <= 159);
    })
  )
    throw new CheckoutError(
      'invalid',
      'Review the departure reason, notes, account choice and confirmation.',
    );
  let response: Response;
  try {
    response = await authorizedRequest(
      `/api/v1/students/${studentID}/checkout`,
      uid,
      signal,
      {
        method: 'POST',
        body: JSON.stringify(input),
        contentType: 'application/json',
      },
    );
  } catch (reason) {
    throw checkoutError(reason);
  }
  if (response.status === 401)
    throw new CheckoutError('session', 'Your session expired. Sign in again.');
  if (response.status === 403)
    throw new CheckoutError(
      'forbidden',
      'Only an active Admin can end a hostel stay.',
    );
  if (response.status === 404)
    throw new CheckoutError(
      'not-found',
      'This student profile is no longer available. Check the student directory.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new CheckoutError(
      'invalid',
      'The checkout request was rejected. Review the original details before starting another operation.',
    );
  if (response.status === 409) {
    const value: unknown = await response.json().catch(() => null);
    if (object(value) && value.error === 'student_already_checked_out')
      throw new CheckoutError(
        'already-ended',
        'This stay has already ended. Check Archived students before starting another checkout.',
      );
    if (object(value) && value.error === 'student_account_required')
      throw new CheckoutError(
        'account',
        'The linked account no longer has the student role. Ask an Admin to review the account.',
      );
    throw new CheckoutError(
      'conflict',
      'This operation conflicts with an existing checkout. Check the directory; do not retry with a new operation ID.',
    );
  }
  if (response.status !== 200) throw unavailable();
  const result: unknown = await response.json().catch(() => null);
  if (
    !object(result) ||
    typeof result.replayed !== 'boolean' ||
    typeof result.revocation_pending !== 'boolean' ||
    !object(result.checkout)
  )
    throw unavailable();
  const c = result.checkout;
  if (
    !uuid(c.checkout_id) ||
    c.request_id !== input.request_id ||
    c.student_id !== studentID ||
    c.user_id !== userID ||
    c.reason !== input.reason ||
    c.notes !== input.notes.trim() ||
    c.deactivate_account !== input.deactivate_account ||
    typeof c.account_active_after !== 'boolean' ||
    (input.deactivate_account && c.account_active_after) ||
    typeof c.profile_was_archived !== 'boolean' ||
    !timestamp(c.archived_at) ||
    !timestamp(c.performed_at) ||
    !uuid(c.performed_by) ||
    !(c.released_allocation_id === null || uuid(c.released_allocation_id)) ||
    !(c.released_bed_id === null || uuid(c.released_bed_id)) ||
    (c.released_allocation_id === null) !== (c.released_bed_id === null)
  )
    throw unavailable();
  return result as unknown as CheckoutResult;
}
