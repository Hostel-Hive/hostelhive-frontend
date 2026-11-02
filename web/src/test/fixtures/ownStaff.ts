import type { StaffAccount } from '../../features/auth/auth.types';
import type { OwnStaffProfile } from '../../features/staff/api/own-staff.api';
import { staffProfile } from './staffProfiles';
export const ownStaffAccount: StaffAccount = {
  user_id: staffProfile.user_id,
  firebase_uid: 'warden-uid',
  email: staffProfile.email,
  role: 'warden',
  is_active: true,
  full_name: staffProfile.full_name,
  designation: staffProfile.designation,
};
export const ownStaffProfile: OwnStaffProfile = {
  full_name: staffProfile.full_name,
  designation: staffProfile.designation,
  email: staffProfile.email,
  role: 'warden',
};
