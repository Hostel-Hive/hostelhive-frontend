import type {
  Student,
  StudentPage,
} from '../../features/students/student.types';
export const studentFixture: Student = {
  student_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  index_no: 'STU-1042',
  full_name: 'Alex Morgan',
  faculty: 'Science',
  year: 2,
  email: 'alex@example.com',
  contact_phone: '+94770000000',
  account_active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  guardians: [
    {
      guardian_id: '33333333-3333-4333-8333-333333333333',
      name: 'Robin Morgan',
      relationship: 'Parent',
      contact_phone: '+94771111111',
    },
  ],
};
export const studentPageFixture: StudentPage = {
  students: [studentFixture],
  limit: 20,
  offset: 0,
  has_more: false,
};
