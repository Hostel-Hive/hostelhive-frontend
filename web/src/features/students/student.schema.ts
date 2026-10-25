import type { CreateStudentInput } from './student.types';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: string, max: number) =>
  value.trim().length > 0 &&
  [...value.trim()].length <= max &&
  [...value.trim()].every((character) => {
    const code = character.codePointAt(0)!;
    return code > 31 && (code < 127 || code > 159);
  });
const phone = (value: string) =>
  /^[+()0-9 -]{7,32}$/.test(value.trim()) &&
  value.replace(/[^0-9]/g, '').length >= 7;
export function validateStudent(input: CreateStudentInput, creating: boolean) {
  const errors: Record<string, string> = {};
  if (creating && !uuid.test(input.user_id.trim()))
    errors.user_id = 'Enter the existing student account UUID.';
  for (const [key, label, max] of [
    ['index_no', 'Student ID', 64],
    ['full_name', 'Full name', 200],
    ['faculty', 'Faculty', 120],
  ] as const)
    if (!text(input[key], max))
      errors[key] =
        `${label} is required and must contain at most ${max} characters without control characters.`;
  if (!Number.isInteger(input.year) || input.year < 1 || input.year > 5)
    errors.year = 'Choose a year between 1 and 5.';
  if (!phone(input.contact_phone))
    errors.contact_phone =
      'Enter a phone number with at least 7 digits (maximum 32 characters).';
  if (input.guardians.length < 1 || input.guardians.length > 10)
    errors.guardians = 'Provide between 1 and 10 guardians.';
  input.guardians.forEach((g, i) => {
    if (!text(g.name, 200))
      errors[`guardian-${i}-name`] =
        'Guardian name is required (maximum 200 characters).';
    if (!text(g.relationship, 80))
      errors[`guardian-${i}-relationship`] =
        'Relationship is required (maximum 80 characters).';
    if (!phone(g.contact_phone))
      errors[`guardian-${i}-contact_phone`] =
        'Enter a valid guardian phone number.';
  });
  return errors;
}
export function normalizeStudent(
  input: CreateStudentInput,
): CreateStudentInput {
  return {
    user_id: input.user_id.trim(),
    index_no: input.index_no.trim(),
    full_name: input.full_name.trim(),
    faculty: input.faculty.trim(),
    year: input.year,
    contact_phone: input.contact_phone.trim(),
    guardians: input.guardians.map((g) => ({
      name: g.name.trim(),
      relationship: g.relationship.trim(),
      contact_phone: g.contact_phone.trim(),
    })),
  };
}
