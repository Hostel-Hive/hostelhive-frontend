import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  validatePassword,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { configuredAuth } from './auth.api';

export class PasswordFlowError extends Error {
  constructor(
    public readonly kind: 'invalid-link' | 'unavailable' | 'weak-password',
    message: string,
  ) {
    super(message);
  }
}
function resetAuth() {
  const auth = configuredAuth();
  if (!auth)
    throw new PasswordFlowError(
      'unavailable',
      'Password recovery is not configured. Contact your hostel administrator.',
    );
  return auth;
}
function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : '';
}
export function passwordErrorMessage(error: unknown) {
  if (error instanceof PasswordFlowError) return error.message;
  switch (errorCode(error)) {
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
      return 'This reset link is invalid, expired or already used. Request a new link.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a password that meets the requirements below.';
    case 'auth/too-many-requests':
      return 'Too many requests. Please try again later.';
    case 'auth/network-request-failed':
      return 'Unable to connect. Check your connection and try again.';
    default:
      return 'Password recovery is unavailable. Please try again later.';
  }
}
export function isInvalidResetLink(error: unknown) {
  return (
    (error instanceof PasswordFlowError && error.kind === 'invalid-link') ||
    [
      'auth/expired-action-code',
      'auth/invalid-action-code',
      'auth/user-disabled',
      'auth/user-not-found',
    ].includes(String(errorCode(error)))
  );
}
export async function requestPasswordReset(email: string) {
  const auth = resetAuth();
  try {
    // The email template's custom action URL supplies the reset handler.
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    // Identical confirmation whether or not an account exists.
    if (
      !['auth/user-not-found', 'auth/user-disabled'].includes(
        String(errorCode(error)),
      )
    )
      throw error;
  }
}
export async function inspectResetLink(code: string) {
  const auth = resetAuth();
  const email = await verifyPasswordResetCode(auth, code);
  const validation = await validatePassword(auth, '');
  return { email, policy: validation.passwordPolicy };
}
export async function completePasswordReset(code: string, password: string) {
  const auth = resetAuth();
  const validation = await validatePassword(auth, password);
  if (!validation.isValid)
    throw new PasswordFlowError(
      'weak-password',
      'Choose a password that meets the requirements below.',
    );
  await confirmPasswordReset(auth, code, password);
}
