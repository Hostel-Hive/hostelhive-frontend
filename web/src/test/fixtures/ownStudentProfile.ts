import type { OwnStudentProfile } from '../../features/student-portal/student-portal.types';
export const ownStudentProfile: OwnStudentProfile = {
  student_id: '11111111-1111-4111-8111-111111111111',
  index_no: 'SC/2026/001',
  full_name: 'Example Student',
  faculty: 'Science',
  year: 2,
  contact_phone: '+94771234567',
  email: 'student@example.com',
  guardians: [
    {
      guardian_id: '22222222-2222-4222-8222-222222222222',
      name: 'Example Guardian',
      relationship: 'Parent',
      contact_phone: '+94771234568',
    },
  ],
  profile_image_url: null,
  accommodation: {
    allocation_id: '33333333-3333-4333-8333-333333333333',
    block_id: '44444444-4444-4444-8444-444444444444',
    block_name: 'Block A',
    room_id: '55555555-5555-4555-8555-555555555555',
    room_no: '101',
    bed_id: '66666666-6666-4666-8666-666666666666',
    bed_no: 'B1',
    started_at: '2026-10-01T09:00:00+05:30',
  },
  presence: { status: 'IN', updated_at: '2026-10-20T10:00:00+05:30' },
};
