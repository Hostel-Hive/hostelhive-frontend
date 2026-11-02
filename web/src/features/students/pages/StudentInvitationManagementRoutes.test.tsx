import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listStudentInvitations } from '../api/invitation-management.api';
import { invitationFixture } from '../../../test/fixtures/student-invitation';
import { studentPageFixture } from '../../../test/fixtures/student';
import { listStudents } from '../api/students.api';
const invitationPage = {
  items: [invitationFixture],
  total: 1,
  limit: 20,
  offset: 0,
  has_more: false,
};
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  listStudents: vi.fn(),
}));
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/invitation-management.api', async (original) => ({
  ...(await original<typeof import('../api/invitation-management.api')>()),
  listStudentInvitations: vi.fn(),
}));
vi.mock('../../dashboard/pages/WardenDashboardPage', () => ({
  default: () => <h1>Warden overview</h1>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'admin-id',
    firebase_uid: 'admin',
    email: 'admin@example.edu',
    role: 'admin',
    is_active: true,
  });
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(listStudentInvitations).mockResolvedValue(invitationPage);
  vi.mocked(listStudents).mockResolvedValue(studentPageFixture);
  window.history.replaceState({}, '', '/dashboard/students/invitations');
});
it('opens the Admin invitations route directly', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Student invitations' }),
  ).toBeVisible();
  expect(
    await screen.findByRole('button', {
      name: `View invitation for ${invitationFixture.email}`,
    }),
  ).toBeVisible();
});
it('links the Admin student directory to invitations', async () => {
  window.history.replaceState({}, '', '/dashboard/students');
  render(<App />);
  expect(
    await screen.findByRole('link', { name: 'Invitations' }),
  ).toHaveAttribute('href', '/dashboard/students/invitations');
});
it('redirects a Warden away from the route and hides the menu', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden-id',
    firebase_uid: 'warden',
    email: 'warden@example.edu',
    role: 'warden',
    is_active: true,
  });
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Warden overview' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Invitations' }),
  ).not.toBeInTheDocument();
  expect(listStudentInvitations).not.toHaveBeenCalled();
});
