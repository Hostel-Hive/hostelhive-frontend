import type {
  StudentPresence,
  AttendanceScan,
  ScanPage,
} from '../../features/attendance/attendance.types';
import { studentFixture } from './student';
export const presenceFixture: StudentPresence = {
  student_id: studentFixture.student_id,
  status: 'IN',
  updated_at: '2026-10-18T08:00:00Z',
};
export const scanFixture: AttendanceScan = {
  student_id: studentFixture.student_id,
  event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  device_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  direction: 'IN',
  outcome: 'recorded',
  occurred_at: '2026-10-18T08:00:00Z',
};
export const scanPage = (
  items: AttendanceScan[] = [],
  offset = 0,
  has_more = false,
): ScanPage => ({ items, offset, has_more, limit: 20 });
export const twentyScans = () =>
  Array.from({ length: 20 }, (_, i) => ({
    ...scanFixture,
    event_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, '0')}`,
  }));
