import { describe, expect, it } from 'vitest';
import { passwordPolicy } from '../../test/fixtures/passwordPolicy';
import {
  parseResetRequest,
  passwordRequirements,
  validateRecoveryEmail,
} from './password.schema';
it.each(['', 'invalid', 'with space@example.com'])(
  'rejects invalid recovery email %s',
  (email) => {
    expect(validateRecoveryEmail(email)).not.toBe('');
  },
);
it('accepts a trimmed email', () => {
  expect(validateRecoveryEmail(' user@example.com ')).toBe('');
});
describe('reset request parsing', () => {
  it.each([
    '',
    '?mode=verifyEmail&oobCode=abc',
    '?mode=resetPassword',
    '?mode=resetPassword&oobCode=',
    '?mode=resetPassword&mode=resetPassword&oobCode=abc',
    '?mode=resetPassword&oobCode=a&oobCode=b',
    '?mode=resetPassword&oobCode=%20abc',
    `?mode=resetPassword&oobCode=${'a'.repeat(2049)}`,
  ])('rejects malformed requests %#', (search) => {
    expect(parseResetRequest(search)).toBeNull();
  });
  it('only captures the reset code and ignores untrusted redirect/configuration parameters', () => {
    expect(
      parseResetRequest(
        '?mode=resetPassword&oobCode=test-code&continueUrl=https://untrusted.example&apiKey=untrusted',
      ),
    ).toEqual({ code: 'test-code' });
  });
});
it('evaluates all configured password requirements without inventing requirements', () => {
  expect(
    passwordRequirements('StrongPass12!', passwordPolicy).every(
      (row) => row.met,
    ),
  ).toBe(true);
  expect(
    passwordRequirements('weak', passwordPolicy).filter((row) => !row.met),
  ).toHaveLength(4);
  expect(
    passwordRequirements('a'.repeat(129), passwordPolicy).find(
      (row) => row.label === 'At most 128 characters',
    )?.met,
  ).toBe(false);
  expect(
    passwordRequirements('anything', {
      ...passwordPolicy,
      customStrengthOptions: {},
    }),
  ).toEqual([]);
});
