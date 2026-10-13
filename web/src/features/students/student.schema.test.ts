import { describe, expect, it } from 'vitest';
import { normalizeStudent, validateStudent } from './student.schema';
import { studentFixture } from '../../test/fixtures/student';
const input = () =>
  normalizeStudent({ ...studentFixture, guardians: studentFixture.guardians! });
describe('student form validation', () => {
  it('accepts valid input and strips guardian IDs and extra response fields', () => {
    expect(validateStudent(input(), true)).toEqual({});
    expect(input()).not.toHaveProperty('email');
    expect(input().guardians[0]).not.toHaveProperty('guardian_id');
  });
  it('validates UUID, required fields, control characters, year and phone', () => {
    expect(
      Object.keys(
        validateStudent(
          {
            ...input(),
            user_id: 'bad',
            index_no: '',
            full_name: 'bad\nname',
            faculty: 'x'.repeat(121),
            year: 11,
            contact_phone: 'abc',
          },
          true,
        ),
      ),
    ).toEqual([
      'user_id',
      'index_no',
      'full_name',
      'faculty',
      'year',
      'contact_phone',
    ]);
    expect(validateStudent({ ...input(), user_id: '' }, false)).toEqual({});
  });
  it('requires between one and ten valid guardians', () => {
    expect(validateStudent({ ...input(), guardians: [] }, true)).toHaveProperty(
      'guardians',
    );
    expect(
      validateStudent(
        { ...input(), guardians: Array(11).fill(input().guardians[0]) },
        true,
      ),
    ).toHaveProperty('guardians');
    expect(
      Object.keys(
        validateStudent(
          {
            ...input(),
            guardians: [{ name: '', relationship: '', contact_phone: '123' }],
          },
          true,
        ),
      ),
    ).toEqual([
      'guardian-0-name',
      'guardian-0-relationship',
      'guardian-0-contact_phone',
    ]);
  });
  it('trims text and accepts supported international phone punctuation', () => {
    const value = normalizeStudent({
      ...input(),
      full_name: ' Alex ',
      contact_phone: ' +94 (77) 000-0000 ',
    });
    expect(value.full_name).toBe('Alex');
    expect(validateStudent(value, true)).toEqual({});
  });
});
