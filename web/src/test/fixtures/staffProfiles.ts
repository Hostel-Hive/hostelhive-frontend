import type {
  StaffProfile,
  StaffPage,
} from '../../features/staff/api/staff.api';
export const staffProfile: StaffProfile = {
  staff_id: '60000000-0000-4000-8000-000000000001',
  user_id: '70000000-0000-4000-8000-000000000001',
  full_name: 'Example Warden',
  designation: 'Senior Warden',
  email: 'warden@example.edu',
  role: 'warden',
  is_active: true,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-21T08:30:00+05:30',
};
export const staffPage = (
  staff = [staffProfile],
  offset = 0,
  has_more = false,
): StaffPage => ({ staff, offset, has_more, limit: 20 });
