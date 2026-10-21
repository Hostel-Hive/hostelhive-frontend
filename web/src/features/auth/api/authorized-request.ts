import { configuredAuth } from './auth.api';
import { parseEnvironment } from '../../../config/env';

export class AuthorizedRequestError extends Error {
  constructor(
    public readonly kind: 'session' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
export interface AuthorizedInput {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  contentType?: string;
}
export async function authorizedRequest(
  path: string,
  uid: string,
  signal: AbortSignal,
  input?: AuthorizedInput,
): Promise<Response> {
  const session = () =>
    new AuthorizedRequestError(
      'session',
      'Your session has expired. Please sign in again.',
    );
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
      error &&
      typeof error === 'object' &&
      'code' in error &&
      [
        'auth/user-token-expired',
        'auth/invalid-user-token',
        'auth/user-disabled',
      ].includes(String(error.code))
    )
      throw session();
    throw new AuthorizedRequestError(
      'unavailable',
      'Unable to contact the service. Please try again.',
    );
  }
  if (auth.currentUser !== user || signal.aborted) throw session();
  const base = import.meta.env.DEV
    ? '/backend-api'
    : parseEnvironment(import.meta.env).apiBaseUrl;
  const response = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input?.contentType ? { 'Content-Type': input.contentType } : {}),
    },
    ...(input
      ? {
          method: input.method,
          ...(input.body !== undefined ? { body: input.body } : {}),
        }
      : {}),
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (auth.currentUser !== user) throw session();
  return response;
}
