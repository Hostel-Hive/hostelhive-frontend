import type { PasswordPolicy } from 'firebase/auth';
// Fictional policy for tests; production loads its policy from Firebase.
export const passwordPolicy: PasswordPolicy = {
  customStrengthOptions: {
    minPasswordLength: 12,
    maxPasswordLength: 128,
    containsLowercaseLetter: true,
    containsUppercaseLetter: true,
    containsNumericCharacter: true,
    containsNonAlphanumericCharacter: true,
  },
  allowedNonAlphanumericCharacters: '!@#$%',
  enforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
};
