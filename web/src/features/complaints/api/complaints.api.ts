import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  Complaint,
  ComplaintAction,
  ComplaintPage,
  ComplaintStatus,
  ComplaintUpdate,
} from '../complaints.types';
export class ComplaintError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'session'
      | 'forbidden'
      | 'not-found'
      | 'conflict'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export const complaintStatuses = [
  'pending',
  'in_progress',
  'resolved',
] as const;
export const complaintCategories = ['maintenance', 'disciplinary'] as const;
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
const integer = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const textOK = (v: unknown): v is string =>
  typeof v === 'string' &&
  Array.from(v).length <= 2000 &&
  !/\p{Cc}/u.test(v.replace(/[\n\r\t]/g, ''));
export const statusLabel = (status: ComplaintStatus) =>
  status === 'in_progress'
    ? 'In progress'
    : status === 'resolved'
      ? 'Resolved'
      : 'Pending';
export const transitions = (
  status: ComplaintStatus,
): ('in_progress' | 'resolved')[] =>
  status === 'pending'
    ? ['in_progress', 'resolved']
    : status === 'in_progress'
      ? ['resolved']
      : ['in_progress'];
export function actionError(
  row: Complaint,
  status: ComplaintAction['status'],
  text: string,
): string | null {
  if (!textOK(text.trim()))
    return 'Use 2000 characters or fewer and remove unsupported control characters.';
  if (!status && row.status === 'resolved')
    return 'Resolved complaints cannot receive notes. Reopen the complaint first.';
  if (status && !transitions(row.status).includes(status))
    return 'Choose a supported transition for the current status.';
  if (
    (!status || status === 'resolved' || row.status === 'resolved') &&
    !text.trim()
  )
    return 'Enter a note or explanation for this action.';
  if (row.version >= Number.MAX_SAFE_INTEGER)
    return 'The complaint version cannot be changed by this client.';
  return null;
}
export function complaintFilters(params: URLSearchParams): URLSearchParams {
  const output = new URLSearchParams({ limit: '20', offset: '0' });
  for (const [key, value] of params) {
    if (
      ![
        'student_id',
        'category',
        'status',
        'created_from',
        'created_to',
        'offset',
      ].includes(key) ||
      params.getAll(key).length !== 1 ||
      !value ||
      (key === 'student_id' && !uuid(value)) ||
      (key === 'category' &&
        !complaintCategories.includes(
          value as (typeof complaintCategories)[number],
        )) ||
      (key === 'status' &&
        !complaintStatuses.includes(value as ComplaintStatus)) ||
      (key.startsWith('created_') && !timestamp(value)) ||
      (key === 'offset' &&
        (!/^\d+$/.test(value) ||
          !integer(Number(value)) ||
          Number(value) > Number.MAX_SAFE_INTEGER - 20))
    )
      throw new ComplaintError(
        'invalid',
        'Invalid complaint filters. Check the student UUID, status, category and date range, or clear filters.',
      );
    output.set(key, key === 'student_id' ? value.toLowerCase() : value);
  }
  if (
    output.has('created_from') &&
    output.has('created_to') &&
    Date.parse(output.get('created_to')!) <=
      Date.parse(output.get('created_from')!)
  )
    throw new ComplaintError(
      'invalid',
      'Created-before time must be later than created-from time.',
    );
  return output;
}
export function validComplaint(v: unknown): v is Complaint {
  if (!v || typeof v !== 'object') return false;
  const r = v as Complaint;
  return (
    uuid(r.complaint_id) &&
    uuid(r.request_id) &&
    uuid(r.student_id) &&
    uuid(r.submitted_by) &&
    complaintCategories.includes(r.category) &&
    complaintStatuses.includes(r.status) &&
    integer(r.version, 1) &&
    textOK(r.description) &&
    Boolean(r.description.trim()) &&
    timestamp(r.created_at) &&
    timestamp(r.updated_at)
  );
}
export function validUpdate(v: unknown): v is ComplaintUpdate {
  if (!v || typeof v !== 'object') return false;
  const r = v as ComplaintUpdate;
  return (
    uuid(r.update_id) &&
    uuid(r.complaint_id) &&
    uuid(r.request_id) &&
    uuid(r.actor_id) &&
    ['created', 'note', 'status', 'image_added', 'image_removed'].includes(
      r.action,
    ) &&
    complaintStatuses.includes(r.new_status) &&
    textOK(r.text) &&
    integer(r.previous_version) &&
    r.version === r.previous_version + 1 &&
    integer(r.version, 1) &&
    timestamp(r.occurred_at) &&
    (r.action === 'created'
      ? r.previous_status === null &&
        r.previous_version === 0 &&
        r.new_status === 'pending'
      : r.previous_version >= 1 &&
        r.previous_status !== null &&
        complaintStatuses.includes(r.previous_status)) &&
    (!r.action.startsWith('image_') || uuid(r.image_id))
  );
}
export function complaintError(e: unknown): ComplaintError {
  if (e instanceof ComplaintError) return e;
  if (e instanceof AuthorizedRequestError && e.kind === 'session')
    return new ComplaintError(
      'session',
      'Your session has expired. Sign in again.',
    );
  return new ComplaintError(
    'unavailable',
    'Complaints are unavailable. Please try again.',
  );
}
async function json(response: Response): Promise<unknown> {
  const errors = {
    400: ['invalid', 'The action or filters are invalid. Check your input.'],
    401: ['session', 'Your session has expired. Sign in again.'],
    403: [
      'forbidden',
      'Access denied. Your account cannot manage these complaints.',
    ],
    404: ['not-found', 'This complaint could not be found.'],
    409: [
      'conflict',
      'The complaint changed or this action is no longer allowed. Reload its current state before continuing.',
    ],
  } as const;
  const error = errors[response.status as keyof typeof errors];
  if (error) throw new ComplaintError(error[0], error[1]);
  if (!response.ok)
    throw new ComplaintError(
      'unavailable',
      'The service could not confirm this request.',
    );
  return response.json();
}
export function validPage<T>(
  v: unknown,
  offset: number,
  validate: (r: unknown) => r is T,
): v is ComplaintPage<T> {
  if (!v || typeof v !== 'object') return false;
  const p = v as ComplaintPage<T>;
  return (
    Array.isArray(p.items) &&
    p.items.length <= 20 &&
    p.items.every(validate) &&
    integer(p.total) &&
    p.total >= (p.items.length ? offset + p.items.length : 0) &&
    p.offset === offset &&
    p.limit === 20 &&
    p.has_more === offset + p.items.length < p.total
  );
}
export async function listComplaints(
  params: URLSearchParams,
  uid: string,
  signal: AbortSignal,
): Promise<ComplaintPage<Complaint>> {
  const q = complaintFilters(params);
  const page = await json(
    await authorizedRequest(`/api/v1/complaints?${q}`, uid, signal),
  );
  if (
    !validPage(page, Number(q.get('offset')), validComplaint) ||
    new Set(page.items.map((r) => r.complaint_id)).size !== page.items.length ||
    page.items.some(
      (r) =>
        (q.has('student_id') && r.student_id !== q.get('student_id')) ||
        (q.has('category') && r.category !== q.get('category')) ||
        (q.has('status') && r.status !== q.get('status')) ||
        (q.has('created_from') &&
          Date.parse(r.created_at) < Date.parse(q.get('created_from')!)) ||
        (q.has('created_to') &&
          Date.parse(r.created_at) >= Date.parse(q.get('created_to')!)),
    )
  )
    throw new ComplaintError(
      'unavailable',
      'The complaint listing could not be verified.',
    );
  return page;
}
export async function getComplaint(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Complaint> {
  if (!uuid(id))
    throw new ComplaintError('invalid', 'Choose a valid complaint.');
  const row = await json(
    await authorizedRequest(
      `/api/v1/complaints/${id.toLowerCase()}`,
      uid,
      signal,
    ),
  );
  if (!validComplaint(row) || row.complaint_id !== id.toLowerCase())
    throw new ComplaintError(
      'unavailable',
      'Complaint details could not be verified.',
    );
  return row;
}
export async function listComplaintUpdates(
  id: string,
  uid: string,
  signal: AbortSignal,
  offset = 0,
): Promise<ComplaintPage<ComplaintUpdate>> {
  if (!uuid(id) || !integer(offset) || offset > Number.MAX_SAFE_INTEGER - 20)
    throw new ComplaintError(
      'invalid',
      'Choose a valid complaint history page.',
    );
  const page = await json(
    await authorizedRequest(
      `/api/v1/complaints/${id.toLowerCase()}/updates?limit=20&offset=${offset}`,
      uid,
      signal,
    ),
  );
  if (
    !validPage(page, offset, validUpdate) ||
    new Set(page.items.map((r) => r.update_id)).size !== page.items.length ||
    page.items.some(
      (r, i) =>
        r.complaint_id !== id.toLowerCase() ||
        (i > 0 && r.version <= page.items[i - 1].version),
    )
  )
    throw new ComplaintError(
      'unavailable',
      'Complaint history could not be verified.',
    );
  return page;
}
export async function changeComplaint(
  row: Complaint,
  input: ComplaintAction,
  uid: string,
  signal: AbortSignal,
): Promise<ComplaintUpdate> {
  const error = actionError(row, input.status, input.text);
  if (
    !validComplaint(row) ||
    !uuid(input.request_id) ||
    input.expected_version !== row.version ||
    error
  )
    throw new ComplaintError(
      'invalid',
      error ?? 'Choose a valid complaint action.',
    );
  const action = input.status ? 'status' : 'note';
  const body: ComplaintAction = {
    request_id: input.request_id,
    expected_version: input.expected_version,
    text: input.text.trim(),
    ...(input.status ? { status: input.status } : {}),
  };
  const update = await json(
    await authorizedRequest(
      `/api/v1/complaints/${row.complaint_id}/${action === 'note' ? 'notes' : 'status'}`,
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
    update.complaint_id !== row.complaint_id ||
    update.request_id !== input.request_id ||
    update.action !== action ||
    update.previous_version !== row.version ||
    update.previous_status !== row.status ||
    update.new_status !== (input.status ?? row.status) ||
    update.text !== body.text
  )
    throw new ComplaintError(
      'unavailable',
      'The action response could not be verified.',
    );
  return update;
}
