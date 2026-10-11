import type { LoginInput } from './auth.types';

export function validateLogin(input: LoginInput) {
  const errors: { email?: string; password?: string } = {};
  if (!input.email.trim()) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  // Existing credentials must remain valid regardless of new-password policy.
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}
