import {
  lateAccessFixture,
  decidedLateAccess,
  consumedLateAccess,
  lateAccessPage,
} from './late-access';
import { ownStudentProfile } from './ownStudentProfile';
import type {
  OwnLateAccess,
  OwnLateAccessPage,
} from '../../features/student-portal/api/own-late-access.api';
export const studentAccessFixture = {
  ...lateAccessFixture,
  student_id: ownStudentProfile.student_id,
};
export const studentDecidedAccess = (
  status: 'approved' | 'rejected' = 'approved',
) => ({
  ...decidedLateAccess(status),
  student_id: ownStudentProfile.student_id,
});
export const studentConsumedAccess = {
  ...consumedLateAccess,
  student_id: ownStudentProfile.student_id,
};
export const ownLateAccessFixture: OwnLateAccess = {
  late_access_id: studentAccessFixture.late_access_id,
  request_id: studentAccessFixture.request_id,
  direction: studentAccessFixture.direction,
  expected_at: studentAccessFixture.expected_at,
  reason: studentAccessFixture.reason,
  status: studentAccessFixture.status,
  created_at: studentAccessFixture.created_at,
  decided_at: null,
  decision_note: '',
};
export const ownLateAccessPage = (
  items = [ownLateAccessFixture],
  offset = 0,
  total = items.length,
): OwnLateAccessPage => ({
  items,
  limit: 20,
  offset,
  total,
  has_more: offset + items.length < total,
});
export const studentAccessPage = () => lateAccessPage([studentAccessFixture]);
