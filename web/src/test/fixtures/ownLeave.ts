import { leaveFixture, decidedLeave, leavePage } from './leave';
import { ownStudentProfile } from './ownStudentProfile';
import type {
  OwnLeave,
  OwnLeavePage,
} from '../../features/student-portal/api/own-leave.api';
export const studentLeaveFixture = {
  ...leaveFixture,
  student_id: ownStudentProfile.student_id,
};
export const studentDecidedLeave = (
  status: 'approved' | 'rejected' = 'approved',
) => ({ ...decidedLeave(status), student_id: ownStudentProfile.student_id });
export const ownLeaveFixture: OwnLeave = {
  leave_id: studentLeaveFixture.leave_id,
  request_id: studentLeaveFixture.request_id,
  starts_at: studentLeaveFixture.starts_at,
  ends_at: studentLeaveFixture.ends_at,
  reason: studentLeaveFixture.reason,
  status: studentLeaveFixture.status,
  created_at: studentLeaveFixture.created_at,
  decided_at: null,
  decision_note: '',
};
export const ownLeavePage = (
  items = [ownLeaveFixture],
  offset = 0,
  total = items.length,
): OwnLeavePage => ({
  items,
  limit: 20,
  offset,
  total,
  has_more: offset + items.length < total,
});
export const studentLeavePage = () => leavePage([studentLeaveFixture]);
