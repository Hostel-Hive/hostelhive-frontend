import type { ManagedUser, UserPage } from '../../features/users/api/users.api';
export const managedUser: ManagedUser = {
  user_id: 'd0be4fa1-b22d-4ef9-9fca-90afe37c9101',
  firebase_uid: 'student-uid',
  email: 'student@example.edu',
  role: 'student',
  is_active: true,
  full_name: 'Example Student',
  designation: '',
};
export const managedUserPage = (
  users = [managedUser],
  offset = 0,
  has_more = false,
): UserPage => ({ users, limit: 20, offset, has_more });
