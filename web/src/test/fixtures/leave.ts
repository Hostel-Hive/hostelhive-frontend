import type { LeavePage, LeaveRequest } from '../../features/leave/leave.types';
export const leaveFixture: LeaveRequest = {
  leave_id: '11111111-1111-4111-8111-111111111111',
  request_id: '22222222-2222-4222-8222-222222222222',
  student_id: '33333333-3333-4333-8333-333333333333',
  submitted_by: '44444444-4444-4444-8444-444444444444',
  starts_at: '2027-03-01T10:00:00Z',
  ends_at: '2027-03-03T10:00:00Z',
  created_at: '2027-02-20T10:00:00Z',
  reason: 'Family visit',
  status: 'pending',
  decided_at: null,
  decided_by: null,
  decision_note: '',
};
export const decidedLeave = (
  status: 'approved' | 'rejected' = 'approved',
  note = 'Reviewed',
): LeaveRequest => ({
  ...leaveFixture,
  status,
  decision_note: note,
  decided_at: '2027-02-21T10:00:00Z',
  decided_by: '55555555-5555-4555-8555-555555555555',
});
export const leavePage = (
  items: LeaveRequest[] = [leaveFixture],
  offset = 0,
  total = items.length,
): LeavePage => ({
  items,
  offset,
  total,
  limit: 20,
  has_more: offset + items.length < total,
});
