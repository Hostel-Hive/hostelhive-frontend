import type { StudentInvitation } from '../../features/students/api/student-invitations.api';
import { studentFixture } from './student';
export const invitationFixture: StudentInvitation = {
  invitation_id: '44444444-4444-4444-8444-444444444444',
  request_id: '55555555-5555-4555-8555-555555555555',
  user_id: studentFixture.user_id,
  student_id: studentFixture.student_id,
  email: 'alex@students.example.edu',
  delivery_status: 'pending',
  attempts: 0,
  created_at: '2026-10-19T12:00:00Z',
  last_requested_at: '2026-10-19T12:00:00Z',
  next_attempt_at: null,
  last_sent_at: null,
  setup_completed_at: null,
};
