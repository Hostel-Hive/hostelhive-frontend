import { configuredAuth } from '../../auth/api/auth.api';
import { parseEnvironment } from '../../../config/env';
import type { Student, StudentPage } from '../student.types';

export class StudentRequestError extends Error {
  constructor(
    public readonly kind:
      'session' | 'forbidden' | 'not-found' | 'invalid' | 'unavailable',
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
function validStudent(value: unknown): value is Student {
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
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
): Promise<unknown> {
  const auth = configuredAuth();
  if (!auth) throw session();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw session();
  let token: string;
  try {
    token = await user.getIdToken();
  } catch (error) {
    if (
      object(error) &&
      [
        'auth/user-token-expired',
        'auth/invalid-user-token',
        'auth/user-disabled',
      ].includes(String(error.code))
    )
      throw session();
    throw unavailable();
  }
  if (auth.currentUser !== user || signal.aborted) throw session();
  const base = import.meta.env.DEV
    ? '/backend-api'
    : parseEnvironment(import.meta.env).apiBaseUrl;
  const response = await fetch(`${base}/api/v1/students${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (auth.currentUser !== user) throw session();
  if (response.status === 401) throw session();
  if (response.status === 403)
    throw new StudentRequestError(
      'forbidden',
      'You do not have permission to view these student records.',
    );
  if (response.status === 404)
    throw new StudentRequestError('not-found', 'Student profile not found.');
  if (response.status === 400)
    throw new StudentRequestError(
      'invalid',
      'The student request is invalid. Check the address or clear the filters.',
    );
  if (!response.ok) throw unavailable();
  return response.json();
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
