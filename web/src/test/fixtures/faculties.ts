import type {
  Faculty,
  FacultyPage,
} from '../../features/faculties/api/faculties.api';
export const faculty: Faculty = {
  faculty_id: '12345678-1234-4234-8234-123456789abc',
  name: 'Science',
  is_active: true,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
};
export const facultyPage: FacultyPage = {
  items: [faculty],
  limit: 20,
  offset: 0,
  has_more: false,
};
