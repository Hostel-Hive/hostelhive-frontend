import type { PasswordPolicy } from 'firebase/auth';

export function parseResetRequest(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get('oobCode');
  if (
    params.getAll('mode').length !== 1 ||
    params.get('mode') !== 'resetPassword' ||
    params.getAll('oobCode').length !== 1 ||
    !code ||
    code !== code.trim() ||
    code.length > 2048
  )
    return null;
  return { code };
}

export function validateRecoveryEmail(email: string) {
  if (!email.trim()) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return 'Enter a valid email address.';
  return '';
}
export function passwordRequirements(password: string, policy: PasswordPolicy) {
  const options = policy.customStrengthOptions;
  const rows: { label: string; met: boolean }[] = [];
  if (options.minPasswordLength !== undefined)
    rows.push({
      label: `At least ${options.minPasswordLength} characters`,
      met: password.length >= options.minPasswordLength,
    });
  if (options.maxPasswordLength !== undefined)
    rows.push({
      label: `At most ${options.maxPasswordLength} characters`,
      met: password.length <= options.maxPasswordLength,
    });
  if (options.containsLowercaseLetter)
    rows.push({ label: 'A lowercase letter', met: /[a-z]/.test(password) });
  if (options.containsUppercaseLetter)
    rows.push({ label: 'An uppercase letter', met: /[A-Z]/.test(password) });
  if (options.containsNumericCharacter)
    rows.push({ label: 'A number', met: /[0-9]/.test(password) });
  if (options.containsNonAlphanumericCharacter)
    rows.push({
      label: 'A symbol allowed by the password policy',
      met: [...password].some((character) =>
        policy.allowedNonAlphanumericCharacters.includes(character),
      ),
    });
  return rows;
}
