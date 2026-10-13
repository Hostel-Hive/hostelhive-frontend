import { beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordPolicy } from '../../../test/fixtures/passwordPolicy';
const sdk = vi.hoisted(() => ({
  auth: {},
  configured: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  validate: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('./auth.api', () => ({ configuredAuth: sdk.configured }));
vi.mock('firebase/auth', () => ({
  sendPasswordResetEmail: sdk.send,
  verifyPasswordResetCode: sdk.verify,
  validatePassword: sdk.validate,
  confirmPasswordReset: sdk.confirm,
}));
import {
  completePasswordReset,
  inspectResetLink,
  isInvalidResetLink,
  passwordErrorMessage,
  PasswordFlowError,
  requestPasswordReset,
} from './password.api';
beforeEach(() => {
  vi.resetAllMocks();
  sdk.configured.mockReturnValue(sdk.auth);
  sdk.send.mockResolvedValue(undefined);
  sdk.verify.mockResolvedValue('staff@example.com');
  sdk.validate.mockResolvedValue({ isValid: true, passwordPolicy });
  sdk.confirm.mockResolvedValue(undefined);
});
describe('password recovery SDK integration', () => {
  it('sends a trimmed email through the configured Firebase app', async () => {
    await requestPasswordReset(' staff@example.com ');
    expect(sdk.send).toHaveBeenCalledWith(sdk.auth, 'staff@example.com');
  });
  it.each(['auth/user-not-found', 'auth/user-disabled'])(
    'does not disclose account existence for %s',
    async (code) => {
      sdk.send.mockRejectedValue({ code });
      await expect(
        requestPasswordReset('unknown@example.com'),
      ).resolves.toBeUndefined();
    },
  );
  it('preserves service failure rather than claiming acceptance', async () => {
    sdk.send.mockRejectedValue({ code: 'auth/network-request-failed' });
    await expect(requestPasswordReset('staff@example.com')).rejects.toEqual({
      code: 'auth/network-request-failed',
    });
  });
  it('verifies reset codes and retrieves the actual configured policy', async () => {
    expect(await inspectResetLink('test-code')).toEqual({
      email: 'staff@example.com',
      policy: passwordPolicy,
    });
    expect(sdk.verify).toHaveBeenCalledWith(sdk.auth, 'test-code');
    expect(sdk.validate).toHaveBeenCalledWith(sdk.auth, '');
  });
  it('does not load password requirements after an invalid code', async () => {
    sdk.verify.mockRejectedValue({ code: 'auth/invalid-action-code' });
    await expect(inspectResetLink('used-code')).rejects.toEqual({
      code: 'auth/invalid-action-code',
    });
    expect(sdk.validate).not.toHaveBeenCalled();
  });
  it('validates policy before confirming a password reset', async () => {
    await completePasswordReset('test-code', 'StrongPass12!');
    expect(sdk.validate).toHaveBeenCalledWith(sdk.auth, 'StrongPass12!');
    expect(sdk.confirm).toHaveBeenCalledWith(
      sdk.auth,
      'test-code',
      'StrongPass12!',
    );
  });
  it('rejects weak passwords without applying a reset', async () => {
    sdk.validate.mockResolvedValue({ isValid: false, passwordPolicy });
    await expect(
      completePasswordReset('test-code', 'weak'),
    ).rejects.toBeInstanceOf(PasswordFlowError);
    expect(sdk.confirm).not.toHaveBeenCalled();
  });
  it('blocks all reset operations without web configuration', async () => {
    sdk.configured.mockReturnValue(null);
    await expect(requestPasswordReset('staff@example.com')).rejects.toThrow(
      'not configured',
    );
    await expect(inspectResetLink('test-code')).rejects.toThrow(
      'not configured',
    );
    await expect(
      completePasswordReset('test-code', 'StrongPass12!'),
    ).rejects.toThrow('not configured');
  });
});
describe('safe password-flow errors', () => {
  it.each([
    'auth/expired-action-code',
    'auth/invalid-action-code',
    'auth/user-disabled',
    'auth/user-not-found',
  ])('classifies %s as an unusable link', (code) => {
    expect(isInvalidResetLink({ code })).toBe(true);
    expect(passwordErrorMessage({ code })).toContain(
      'invalid, expired or already used',
    );
  });
  it.each(['auth/weak-password', 'auth/password-does-not-meet-requirements'])(
    'explains %s without private details',
    (code) => {
      expect(passwordErrorMessage({ code })).toContain('requirements');
    },
  );
  it.each(['auth/too-many-requests', 'auth/network-request-failed'])(
    'maps %s to a safe message',
    (code) => {
      expect(passwordErrorMessage({ code })).not.toContain(code);
    },
  );
  it('handles arbitrary failures and application errors', () => {
    expect(passwordErrorMessage(new Error('secret'))).not.toContain('secret');
    expect(passwordErrorMessage(null)).toContain('unavailable');
    expect(
      passwordErrorMessage(
        new PasswordFlowError('unavailable', 'Safe message'),
      ),
    ).toBe('Safe message');
    expect(
      isInvalidResetLink(new PasswordFlowError('invalid-link', 'Safe message')),
    ).toBe(true);
    expect(isInvalidResetLink(null)).toBe(false);
  });
});
