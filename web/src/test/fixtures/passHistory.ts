import type {
  StudentPass,
  PassPage,
} from '../../features/student-portal/api/pass-history.api';
import { ownStudentProfile } from './ownStudentProfile';
export const leavePass: StudentPass = {
  type: 'leave',
  source_id: '11111111-1111-4111-8111-111111111111',
  request_id: '22222222-2222-4222-8222-222222222222',
  student_id: ownStudentProfile.student_id,
  reason: 'Family visit',
  status: 'pending',
  created_at: '2026-10-20T10:00:00Z',
  starts_at: '2026-10-23T08:00:00Z',
  ends_at: '2026-10-24T18:00:00Z',
  direction: null,
  expected_at: null,
  decided_at: null,
  decided_by: null,
  decision_note: '',
  cancelled_at: null,
  cancelled_by: null,
  consumed_at: null,
};
export const accessPass: StudentPass = {
  ...leavePass,
  type: 'late_access',
  reason: 'Return from event',
  starts_at: null,
  ends_at: null,
  direction: 'IN',
  expected_at: '2026-10-23T22:00:00Z',
};
export const approvedPass: StudentPass = {
  ...accessPass,
  status: 'approved',
  decided_at: '2026-10-20T12:00:00Z',
  decided_by: '33333333-3333-4333-8333-333333333333',
  decision_note: 'Return through the main entrance.',
  consumed_at: '2026-10-23T22:10:00Z',
};
export const cancelledPass: StudentPass = {
  ...leavePass,
  status: 'cancelled',
  cancelled_at: '2026-10-20T14:00:00Z',
  cancelled_by: '33333333-3333-4333-8333-333333333333',
};
export const passPage = (
  items: StudentPass[] = [accessPass, leavePass],
  offset = 0,
  total = items.length,
): PassPage => ({
  items,
  total,
  offset,
  limit: 20,
  has_more: offset + items.length < total,
});
