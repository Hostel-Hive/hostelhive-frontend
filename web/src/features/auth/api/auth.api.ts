import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { parseEnvironment } from '../../../config/env';
import type { LoginInput, StaffAccount } from '../auth.types';

const configurationMessage =
  'Sign-in is not configured yet. Contact the project administrator.';

function configuredAuth() {
  const {
    VITE_FIREBASE_API_KEY: apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: authDomain,
    VITE_FIREBASE_PROJECT_ID: projectId,
  } = import.meta.env;
  if (!apiKey || !authDomain || !projectId) return null;
  const app =
    getApps().find((item) => item.name === 'hostelhive-web') ??
    initializeApp({ apiKey, authDomain, projectId }, 'hostelhive-web');
  return getAuth(app);
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'LoginError')
    return error.message;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Unable to sign in. Check your email and password.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Unable to connect. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'Unable to sign in. Contact the Head Warden for assistance.';
    default:
      return 'Sign-in is unavailable. Please try again later.';
  }
}

function loginError(message: string) {
  const error = new Error(message);
  error.name = 'LoginError';
  return error;
}

async function verifyStaffAccount(
  uid: string,
  token: string,
): Promise<StaffAccount> {
  const { apiBaseUrl } = parseEnvironment(import.meta.env);
  const base = import.meta.env.DEV ? '/backend-api' : apiBaseUrl;
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw loginError('Unable to reach the hostel service. Please try again.');
  }
  if (response.status === 401)
    throw loginError('Your session has expired. Please sign in again.');
  if (response.status === 403)
    throw loginError(
      'This account cannot access the staff portal. Contact the Head Warden.',
    );
  if (!response.ok)
    throw loginError(
      'The hostel service is unavailable. Please try again later.',
    );
  const account: unknown = await response.json();
  if (
    typeof account !== 'object' ||
    account === null ||
    !('user_id' in account) ||
    typeof account.user_id !== 'string' ||
    !account.user_id ||
    !('email' in account) ||
    typeof account.email !== 'string' ||
    !('firebase_uid' in account) ||
    account.firebase_uid !== uid ||
    !('is_active' in account) ||
    account.is_active !== true ||
    !('role' in account) ||
    (account.role !== 'admin' && account.role !== 'warden')
  ) {
    throw loginError(
      'This account cannot access the staff portal. Contact the Head Warden.',
    );
  }
  return account as StaffAccount;
}

export async function login(input: LoginInput): Promise<StaffAccount> {
  const auth = configuredAuth();
  if (!auth) throw loginError(configurationMessage);
  try {
    await auth.authStateReady();
    await setPersistence(
      auth,
      input.rememberMe ? browserLocalPersistence : browserSessionPersistence,
    );
    const { user } = await signInWithEmailAndPassword(
      auth,
      input.email.trim(),
      input.password,
    );
    return await verifyStaffAccount(user.uid, await user.getIdToken());
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    throw error;
  }
}

export async function restoreStaffSession(): Promise<StaffAccount | null> {
  const auth = configuredAuth();
  if (!auth) return null;
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  try {
    const user = auth.currentUser;
    return await verifyStaffAccount(user.uid, await user.getIdToken());
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    throw error;
  }
}
