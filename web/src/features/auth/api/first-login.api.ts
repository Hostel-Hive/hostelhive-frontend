import { validatePassword } from 'firebase/auth';
import { configuredAuth } from './auth.api';

class FirstLoginPolicyError extends Error {}
function policyAuth() {
  const auth = configuredAuth();
  if (!auth)
    throw new FirstLoginPolicyError(
      'Password requirements are not configured. Contact your hostel administrator.',
    );
  return auth;
}
// This preview reads/validates policy only. It never updates credentials or account state.
export async function loadFirstLoginPolicy() {
  return (await validatePassword(policyAuth(), '')).passwordPolicy;
}
export async function validateFirstLoginPassword(password: string) {
  return (await validatePassword(policyAuth(), password)).isValid;
}
export function firstLoginErrorMessage(error: unknown) {
  if (error instanceof FirstLoginPolicyError) return error.message;
  return 'Unable to check password requirements. Please try again.';
}
