import type {
  Incident,
  PresenceRow,
  StaffAttendancePage,
} from '../../features/attendance/api/staff-attendance.api';
export const staffPresence: PresenceRow = {
  student_id: '11111111-1111-4111-8111-111111111111',
  index_no: 'SCI/2026/001',
  full_name: 'Sample Student',
  status: 'IN',
  updated_at: '2026-10-20T08:00:00Z',
};
export const staffSummary = { total: 10, in: 6, out: 3, unknown: 1 };
export const incidentFixture: Incident = {
  incident_id: '22222222-2222-4222-8222-222222222222',
  student_id: staffPresence.student_id,
  device_id: '33333333-3333-4333-8333-333333333333',
  event_id: '44444444-4444-4444-8444-444444444444',
  direction: 'OUT',
  incident_type: 'early_exit',
  occurred_at: '2026-10-20T00:30:00Z',
  hostel_timezone: 'Asia/Colombo',
  exit_opening_minute: 360,
  entry_deadline_minute: 1200,
  permission_window_seconds: 1800,
};
export function staffPage<T>(
  items: T[],
  offset = 0,
  total = items.length,
): StaffAttendancePage<T> {
  return {
    items,
    total,
    limit: 20,
    offset,
    has_more: offset + items.length < total,
  };
}
