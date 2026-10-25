import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';
import type {
  Student,
  StudentPage,
  StudentDetails,
  CreateStudentInput,
  CreateStudentByEmailInput,
} from '../student.types';

export class StudentRequestError extends Error {
  constructor(
    public readonly kind:
      | 'session'
      | 'forbidden'
      | 'not-found'
      | 'invalid'
      | 'unavailable'
      | 'duplicate'
      | 'account',
    message: string,
  ) {
    super(message);
  }
}
const unavailable = () =>
  new StudentRequestError(
    'unavailable',
    'Unable to load student records. Please try again.',
  );
const session = () =>
  new StudentRequestError(
    'session',
    'Your session has expired. Please sign in again.',
  );
export function studentError(error: unknown) {
  return error instanceof StudentRequestError ? error : unavailable();
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function validStudent(value: unknown): value is Student {
  if (!object(value)) return false;
  return (
    typeof value.student_id === 'string' &&
    uuid.test(value.student_id) &&
    [
      'user_id',
      'index_no',
      'full_name',
      'faculty',
      'contact_phone',
      'email',
      'created_at',
      'updated_at',
    ].every((key) => typeof value[key] === 'string') &&
    Number.isInteger(value.year) &&
    Number(value.year) >= 1 &&
    Number(value.year) <= 10 &&
    typeof value.account_active === 'boolean' &&
    (value.profile_image_url === undefined ||
      typeof value.profile_image_url === 'string') &&
    (value.guardians === undefined ||
      (Array.isArray(value.guardians) &&
        value.guardians.every(
          (g) =>
            object(g) &&
            ['guardian_id', 'name', 'relationship', 'contact_phone'].every(
              (key) => typeof g[key] === 'string',
            ),
        )))
  );
}
export function directoryQuery(params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim();
  const faculty = (params.get('faculty') ?? '').trim();
  const year = params.get('year') ?? '';
  const rawOffset = params.get('offset') ?? '0';
  if (
    q.length > 200 ||
    faculty.length > 120 ||
    (year && !/^(?:[1-9]|10)$/.test(year)) ||
    !/^\d+$/.test(rawOffset) ||
    Number(rawOffset) > 1000000
  )
    throw new StudentRequestError(
      'invalid',
      'These directory filters are invalid. Clear the filters and try again.',
    );
  const query = new URLSearchParams({
    limit: '20',
    offset: String(Number(rawOffset)),
  });
  if (q) query.set('q', q);
  if (faculty) query.set('faculty', faculty);
  if (year) query.set('year', year);
  return query;
}
export async function studentResponse(
  path: string,
  uid: string,
  signal: AbortSignal,
  input?: {
    method: 'POST' | 'PUT' | 'DELETE';
    body?: BodyInit;
    contentType?: string;
  },
): Promise<Response> {
  let response: Response;
  try {
    response = await authorizedRequest(
      `/api/v1/students${path}`,
      uid,
      signal,
      input,
    );
  } catch (error) {
    if (error instanceof AuthorizedRequestError)
      throw error.kind === 'session' ? session() : unavailable();
    throw error;
  }
  if (response.status === 401) throw session();
  if (response.status === 403)
    throw new StudentRequestError(
      'forbidden',
      'You do not have permission to view these student records.',
    );
  if (response.status === 404)
    throw new StudentRequestError('not-found', 'Student profile not found.');
  if (response.status === 413 || response.status === 415)
    throw new StudentRequestError(
      'invalid',
      path.startsWith('/import')
        ? 'Choose a UTF-8 CSV up to 2 MiB.'
        : 'Choose a JPEG or PNG photo up to 5 MiB.',
    );
  if (response.status === 400)
    throw new StudentRequestError(
      'invalid',
      'The student request is invalid. Check the address or clear the filters.',
    );
  if (response.status === 409) {
    const value: unknown = await response.json();
    if (object(value) && value.error === 'active_student_account_required')
      throw new StudentRequestError(
        'account',
        'No eligible active student account was found. Ask an administrator to check the student email and account status.',
      );
    throw new StudentRequestError(
      'duplicate',
      'This student ID or account already has a profile. Check the existing student records before submitting again.',
    );
  }
  if (!response.ok) throw unavailable();
  return response;
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  input?:
    | { method: 'POST' | 'PUT'; body: StudentDetails | CreateStudentInput }
    | { method: 'DELETE' },
): Promise<unknown> {
  const response = await studentResponse(
    path,
    uid,
    signal,
    input && {
      method: input.method,
      ...('body' in input
        ? { body: JSON.stringify(input.body), contentType: 'application/json' }
        : {}),
    },
  );
  if (input?.method === 'DELETE') {
    if (response.status !== 204) throw unavailable();
    return;
  }
  return response.json();
}
export async function archiveStudent(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<void> {
  if (!uuid.test(id))
    throw new StudentRequestError('not-found', 'Student profile not found.');
  await request(`/${encodeURIComponent(id)}`, uid, signal, {
    method: 'DELETE',
  });
}
export async function createStudent(
  input: CreateStudentInput,
  uid: string,
  signal: AbortSignal,
): Promise<Student> {
  if (!uuid.test(input.user_id))
    throw new StudentRequestError(
      'invalid',
      'Enter a valid student account ID.',
    );
  const value = await request('', uid, signal, { method: 'POST', body: input });
  if (
    !validStudent(value) ||
    value.user_id.toLowerCase() !== input.user_id.toLowerCase()
  )
    throw unavailable();
  return value;
}
export async function createStudentByEmail(
  input: CreateStudentByEmailInput,
  uid: string,
  signal: AbortSignal,
): Promise<Student> {
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new StudentRequestError('invalid', 'Enter a valid university email.');
  const body: CreateStudentByEmailInput = {
    email,
    index_no: input.index_no,
    full_name: input.full_name,
    faculty: input.faculty,
    year: input.year,
    contact_phone: input.contact_phone,
    guardians: input.guardians.map(({ name, relationship, contact_phone }) => ({
      name,
      relationship,
      contact_phone,
    })),
  };
  const value = await request('', uid, signal, { method: 'POST', body });
  if (
    !validStudent(value) ||
    !uuid.test(value.user_id) ||
    value.email.toLowerCase() !== email ||
    !value.account_active
  )
    throw unavailable();
  return value;
}
export async function updateStudent(
  id: string,
  input: StudentDetails,
  uid: string,
  signal: AbortSignal,
): Promise<Student> {
  if (!uuid.test(id))
    throw new StudentRequestError('not-found', 'Student profile not found.');
  const value = await request(`/${id}`, uid, signal, {
    method: 'PUT',
    body: input,
  });
  if (
    !validStudent(value) ||
    value.student_id.toLowerCase() !== id.toLowerCase()
  )
    throw unavailable();
  return value;
}
export async function listStudents(
  params: URLSearchParams,
  uid: string,
  signal: AbortSignal,
): Promise<StudentPage> {
  const query = directoryQuery(params);
  const value = await request(`?${query}`, uid, signal);
  if (
    !object(value) ||
    !Array.isArray(value.students) ||
    !value.students.every(validStudent) ||
    value.limit !== 20 ||
    value.offset !== Number(query.get('offset')) ||
    typeof value.has_more !== 'boolean' ||
    value.students.length > 20
  )
    throw unavailable();
  return value as unknown as StudentPage;
}
export async function getStudent(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Student> {
  if (!uuid.test(id))
    throw new StudentRequestError('not-found', 'Student profile not found.');
  const value = await request(`/${encodeURIComponent(id)}`, uid, signal);
  if (
    !validStudent(value) ||
    value.student_id.toLowerCase() !== id.toLowerCase()
  )
    throw unavailable();
  return value;
}
