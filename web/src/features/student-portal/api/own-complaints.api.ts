import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import {
  complaintCategories,
  complaintStatuses,
  uuid,
  validComplaint,
  validUpdate,
  validPage,
} from '../../complaints/api/complaints.api';
import type {
  Complaint,
  ComplaintAction,
  ComplaintCategory,
  ComplaintPage,
  ComplaintStatus,
  ComplaintUpdate,
} from '../../complaints/complaints.types';
import { StudentPortalError } from './student-portal.api';

export interface ComplaintSubmission {
  request_id: string;
  category: ComplaintCategory;
  description: string;
}
export class OwnComplaintError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'setup'
      | 'not-found'
      | 'conflict'
      | 'ineligible'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export function ownComplaintError(error: unknown): OwnComplaintError {
  if (error instanceof OwnComplaintError) return error;
  if (error instanceof AuthorizedRequestError && error.kind === 'session')
    return new OwnComplaintError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new OwnComplaintError(
    'unavailable',
    'Unable to confirm the complaint request. Please try again.',
  );
}
export function complaintAccessError(error: OwnComplaintError) {
  return error.kind === 'session' ||
    error.kind === 'forbidden' ||
    error.kind === 'setup'
    ? new StudentPortalError(error.kind, error.message)
    : null;
}
export function complaintTextError(text: string) {
  if (!text.trim()) return 'Enter a description or note.';
  if (Array.from(text.trim()).length > 2000)
    return 'Use 2000 characters or fewer.';
  if (/\p{Cc}/u.test(text.replace(/[\n\r\t]/g, '')))
    return 'Remove unsupported control characters.';
  return '';
}
const validID = (value: unknown): value is string =>
  uuid(value) && value !== '00000000-0000-0000-0000-000000000000';
function requireID(value: string) {
  if (!validID(value))
    throw new OwnComplaintError(
      'invalid',
      'Choose a valid complaint or student profile.',
    );
}
function ownRow(value: unknown, studentID: string): Complaint {
  if (!validComplaint(value) || value.student_id !== studentID.toLowerCase())
    throw ownComplaintError(null);
  return value;
}
async function json(response: Response, expected = 200): Promise<unknown> {
  if (response.status === expected) return response.json();
  const body = await response.json().catch(() => null);
  const code = body?.error;
  if (response.status === 401)
    throw new OwnComplaintError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new OwnComplaintError(
      code === 'setup_required' ? 'setup' : 'forbidden',
      code === 'setup_required'
        ? 'Complete your student account setup first.'
        : 'Your account cannot access these complaints.',
    );
  if (response.status === 404)
    throw new OwnComplaintError(
      'not-found',
      'This complaint is unavailable or does not belong to your account.',
    );
  if (response.status === 409)
    throw new OwnComplaintError(
      code === 'active_student_required' ? 'ineligible' : 'conflict',
      code === 'active_student_required'
        ? 'An active student profile is required. Contact your hostel administrator.'
        : 'The complaint changed or this action conflicts. Reload and review the current complaint before a new action.',
    );
  if ([400, 413, 415].includes(response.status))
    throw new OwnComplaintError(
      'invalid',
      'Check the category and text. Use 1–2000 characters without unsupported controls.',
    );
  throw ownComplaintError(null);
}
export async function listOwnComplaints(
  uid: string,
  studentID: string,
  signal: AbortSignal,
  status: ComplaintStatus | '' = '',
  category: ComplaintCategory | '' = '',
  offset = 0,
): Promise<ComplaintPage<Complaint>> {
  try {
    requireID(studentID);
    if (
      (status && !complaintStatuses.includes(status)) ||
      (category && !complaintCategories.includes(category)) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > Number.MAX_SAFE_INTEGER - 20
    )
      throw new OwnComplaintError(
        'invalid',
        'Choose a valid status, category and page.',
      );
    const query = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (status) query.set('status', status);
    if (category) query.set('category', category);
    const page = await json(
      await authorizedRequest(`/api/v1/complaints?${query}`, uid, signal),
    );
    if (
      !validPage(page, offset, validComplaint) ||
      new Set(page.items.map((row) => row.complaint_id)).size !==
        page.items.length
    )
      throw ownComplaintError(null);
    for (const row of page.items) {
      ownRow(row, studentID);
      if (
        (status && row.status !== status) ||
        (category && row.category !== category)
      )
        throw ownComplaintError(null);
    }
    if (signal.aborted) throw ownComplaintError(null);
    return page;
  } catch (error) {
    throw ownComplaintError(error);
  }
}
export async function getOwnComplaint(
  id: string,
  uid: string,
  studentID: string,
  signal: AbortSignal,
): Promise<Complaint> {
  try {
    requireID(id);
    requireID(studentID);
    const row = ownRow(
      await json(
        await authorizedRequest(
          `/api/v1/complaints/${id.toLowerCase()}`,
          uid,
          signal,
        ),
      ),
      studentID,
    );
    if (row.complaint_id !== id.toLowerCase() || signal.aborted)
      throw ownComplaintError(null);
    return row;
  } catch (error) {
    throw ownComplaintError(error);
  }
}
export async function getOwnComplaintHistory(
  row: Complaint,
  uid: string,
  studentID: string,
  signal: AbortSignal,
  offset = 0,
): Promise<ComplaintPage<ComplaintUpdate>> {
  try {
    requireID(studentID);
    ownRow(row, studentID);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > Number.MAX_SAFE_INTEGER - 20
    )
      throw new OwnComplaintError('invalid', 'Choose a valid history page.');
    const page = await json(
      await authorizedRequest(
        `/api/v1/complaints/${row.complaint_id}/updates?limit=20&offset=${offset}`,
        uid,
        signal,
      ),
    );
    if (
      !validPage(page, offset, validUpdate) ||
      new Set(page.items.map((item) => item.update_id)).size !==
        page.items.length ||
      page.items.some(
        (item, index) =>
          item.complaint_id !== row.complaint_id ||
          (index > 0 && item.version <= page.items[index - 1].version),
      ) ||
      signal.aborted
    )
      throw ownComplaintError(null);
    return page;
  } catch (error) {
    throw ownComplaintError(error);
  }
}
export async function submitOwnComplaint(
  payload: ComplaintSubmission,
  uid: string,
  studentID: string,
  signal: AbortSignal,
) {
  try {
    requireID(studentID);
    requireID(payload.request_id);
    if (
      !complaintCategories.includes(payload.category) ||
      complaintTextError(payload.description)
    )
      throw new OwnComplaintError(
        'invalid',
        'Choose a category and enter a description of up to 2000 characters.',
      );
    const body = {
      request_id: payload.request_id,
      category: payload.category,
      description: payload.description.trim(),
    };
    const row = ownRow(
      await json(
        await authorizedRequest('/api/v1/complaints', uid, signal, {
          method: 'POST',
          contentType: 'application/json',
          body: JSON.stringify(body),
        }),
        201,
      ),
      studentID,
    );
    // A replay can return a complaint whose status/version has since advanced.
    if (
      row.request_id !== body.request_id ||
      row.description !== body.description ||
      row.category !== body.category ||
      signal.aborted
    )
      throw ownComplaintError(null);
    return row;
  } catch (error) {
    throw ownComplaintError(error);
  }
}
export async function addOwnComplaintNote(
  row: Complaint,
  payload: ComplaintAction,
  uid: string,
  studentID: string,
  signal: AbortSignal,
) {
  try {
    requireID(studentID);
    ownRow(row, studentID);
    requireID(payload.request_id);
    if (
      payload.status ||
      row.status === 'resolved' ||
      row.version >= Number.MAX_SAFE_INTEGER ||
      payload.expected_version !== row.version ||
      complaintTextError(payload.text)
    )
      throw new OwnComplaintError(
        'invalid',
        'Enter a note for an unresolved complaint using its current version.',
      );
    const body = {
      request_id: payload.request_id,
      expected_version: payload.expected_version,
      text: payload.text.trim(),
    };
    const update = await json(
      await authorizedRequest(
        `/api/v1/complaints/${row.complaint_id}/notes`,
        uid,
        signal,
        {
          method: 'POST',
          contentType: 'application/json',
          body: JSON.stringify(body),
        },
      ),
    );
    if (
      !validUpdate(update) ||
      update.action !== 'note' ||
      update.complaint_id !== row.complaint_id ||
      update.request_id !== body.request_id ||
      update.previous_version !== row.version ||
      update.previous_status !== row.status ||
      update.new_status !== row.status ||
      update.text !== body.text ||
      signal.aborted
    )
      throw ownComplaintError(null);
    return update;
  } catch (error) {
    throw ownComplaintError(error);
  }
}
