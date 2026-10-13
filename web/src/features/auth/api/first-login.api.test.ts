import { beforeEach, expect, it, vi } from 'vitest';
import { passwordPolicy } from '../../../test/fixtures/passwordPolicy';
const sdk = vi.hoisted(() => ({
  configured: vi.fn(),
  validate: vi.fn(),
  updatePassword: vi.fn(),
  confirmPasswordReset: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock('./auth.api', () => ({ configuredAuth: sdk.configured }));
vi.mock('firebase/auth', () => ({
  validatePassword: sdk.validate,
  updatePassword: sdk.updatePassword,
  confirmPasswordReset: sdk.confirmPasswordReset,
  signInWithEmailAndPassword: sdk.signIn,
}));
import {
  firstLoginErrorMessage,
  loadFirstLoginPolicy,
  validateFirstLoginPassword,
} from './first-login.api';
beforeEach(() => {
  vi.resetAllMocks();
  sdk.configured.mockReturnValue({});
  sdk.validate.mockResolvedValue({ isValid: true, passwordPolicy });
});
it('loads policy and validates a sample without updating credentials or signing in', async () => {
  expect(await loadFirstLoginPolicy()).toEqual(passwordPolicy);
  expect(sdk.validate).toHaveBeenNthCalledWith(1, {}, '');
  expect(await validateFirstLoginPassword('SamplePass12!')).toBe(true);
  expect(sdk.validate).toHaveBeenNthCalledWith(2, {}, 'SamplePass12!');
  expect(sdk.updatePassword).not.toHaveBeenCalled();
  expect(sdk.confirmPasswordReset).not.toHaveBeenCalled();
  expect(sdk.signIn).not.toHaveBeenCalled();
});
it('returns invalid policy results without claiming setup success', async () => {
  sdk.validate.mockResolvedValue({ isValid: false, passwordPolicy });
  expect(await validateFirstLoginPassword('weak')).toBe(false);
});
it('handles missing configuration and protects raw provider errors', async () => {
  sdk.configured.mockReturnValue(null);
  try {
    await loadFirstLoginPolicy();
    throw new Error('expected failure');
  } catch (error) {
    expect(firstLoginErrorMessage(error)).toContain('not configured');
  }
  await expect(validateFirstLoginPassword('SamplePass12!')).rejects.toThrow(
    'not configured',
  );
  expect(firstLoginErrorMessage(new Error('secret details'))).not.toContain(
    'secret',
  );
});
it('propagates policy service failures for retry', async () => {
  sdk.validate.mockRejectedValue(new Error('offline'));
  await expect(loadFirstLoginPolicy()).rejects.toThrow('offline');
});
