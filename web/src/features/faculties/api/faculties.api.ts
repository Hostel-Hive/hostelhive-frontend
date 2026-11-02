import {
  authorizedRequest,
  AuthorizedRequestError,
} from '../../auth/api/authorized-request';

export interface Faculty {
  faculty_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface FacultyPage {
  items: Faculty[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export type FacultyFilter = 'true' | 'false' | 'all';
export type FacultyAction = 'create' | 'rename' | 'activate' | 'deactivate';
export class FacultyError extends Error {
  constructor(
    public readonly kind:
      'invalid' | 'forbidden' | 'missing' | 'conflict' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
const base = '/api/v1/faculties';
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
export function facultyNameError(name: string) {
  if (!name.trim()) return 'Enter a faculty name.';
  if (Array.from(name.trim()).length > 120 || /\p{Cc}/u.test(name.trim()))
    return 'Use up to 120 characters without control characters.';
}
export function facultyAccessDenied(error: unknown) {
  return (
    (error instanceof AuthorizedRequestError && error.kind === 'session') ||
    (error instanceof FacultyError && error.kind === 'forbidden')
  );
}
const unavailable = () =>
  new FacultyError(
    'unavailable',
    'The faculty request could not be confirmed. Refresh the directory before trying again.',
  );
function validFaculty(v: unknown): v is Faculty {
  if (!v || typeof v !== 'object') return false;
  const f = v as Faculty;
  return (
    uuid(f.faculty_id) &&
    typeof f.name === 'string' &&
    !facultyNameError(f.name) &&
    typeof f.is_active === 'boolean' &&
    [f.created_at, f.updated_at].every(
      (t) => typeof t === 'string' && Number.isFinite(Date.parse(t)),
    )
  );
}
async function request(
  path: string,
  uid: string,
  signal: AbortSignal,
  method?: 'POST' | 'PATCH',
  name?: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await authorizedRequest(
      base + path,
      uid,
      signal,
      method
        ? {
            method,
            ...(name !== undefined
              ? {
                  body: JSON.stringify({ name: name.trim() }),
                  contentType: 'application/json',
                }
              : {}),
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof AuthorizedRequestError && error.kind === 'session')
      throw error;
    throw unavailable();
  }
  if (response.status === 401)
    throw new AuthorizedRequestError(
      'session',
      'Your session has expired. Sign in again.',
    );
  if (response.status === 403)
    throw new FacultyError(
      'forbidden',
      'Your account no longer has permission to access this faculty operation.',
    );
  if (response.status === 400)
    throw new FacultyError('invalid', 'Check the faculty name and try again.');
  if (response.status === 404)
    throw new FacultyError(
      'missing',
      'This faculty could not be found. Refresh the directory.',
    );
  if (response.status === 409)
    throw new FacultyError(
      'conflict',
      'This faculty name is reserved, including previous names and inactive faculties. Choose another name.',
    );
  if (!response.ok) throw unavailable();
  try {
    return await response.json();
  } catch {
    throw unavailable();
  }
}
export async function listFaculties(
  uid: string,
  signal: AbortSignal,
  active: FacultyFilter = 'true',
  offset = 0,
  limit = 20,
): Promise<FacultyPage> {
  if (
    !['true', 'false', 'all'].includes(active) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new FacultyError('invalid', 'Invalid faculty list filters.');
  const v = (await request(
    `?active=${active}&limit=${limit}&offset=${offset}`,
    uid,
    signal,
  )) as FacultyPage | null;
  if (
    !v ||
    !Array.isArray(v.items) ||
    !v.items.every(validFaculty) ||
    v.items.length > limit ||
    (active !== 'all' &&
      v.items.some((f) => f.is_active !== (active === 'true'))) ||
    v.offset !== offset ||
    v.limit !== limit ||
    typeof v.has_more !== 'boolean' ||
    new Set(v.items.map((f) => f.faculty_id)).size !== v.items.length
  )
    throw unavailable();
  return v;
}
export async function getFaculty(
  id: string,
  uid: string,
  signal: AbortSignal,
): Promise<Faculty> {
  if (!uuid(id)) throw new FacultyError('invalid', 'Select a valid faculty.');
  const v = await request('/' + id, uid, signal);
  if (!validFaculty(v) || v.faculty_id.toLowerCase() !== id.toLowerCase())
    throw unavailable();
  return v;
}
export async function changeFaculty(
  action: FacultyAction,
  uid: string,
  signal: AbortSignal,
  id?: string,
  name?: string,
): Promise<Faculty> {
  if (
    !['create', 'rename', 'activate', 'deactivate'].includes(action) ||
    (action !== 'create' && !uuid(id)) ||
    (['create', 'rename'].includes(action) &&
      (typeof name !== 'string' || facultyNameError(name)))
  )
    throw new FacultyError(
      'invalid',
      'Enter a valid faculty name and select a valid faculty.',
    );
  const named = action === 'create' || action === 'rename';
  const path =
    action === 'create'
      ? ''
      : `/${id}${action === 'rename' ? '' : '/' + action}`;
  const v = await request(
    path,
    uid,
    signal,
    action === 'rename' ? 'PATCH' : 'POST',
    named ? name : undefined,
  );
  if (
    !validFaculty(v) ||
    (action !== 'create' && v.faculty_id.toLowerCase() !== id!.toLowerCase()) ||
    (named && v.name !== name!.trim()) ||
    (action === 'activate' && !v.is_active) ||
    (action === 'deactivate' && v.is_active)
  )
    throw unavailable();
  return v;
}
export async function activeFaculties(
  uid: string,
  signal: AbortSignal,
): Promise<Faculty[]> {
  const rows: Faculty[] = [];
  for (let offset = 0; offset <= 100000; offset += 100) {
    const page = await listFaculties(uid, signal, 'true', offset, 100);
    if (
      page.items.some(
        (f) =>
          !f.is_active || rows.some((row) => row.faculty_id === f.faculty_id),
      )
    )
      throw unavailable();
    rows.push(...page.items);
    if (!page.has_more) return rows;
    if (page.items.length !== 100) throw unavailable();
  }
  throw unavailable();
}
