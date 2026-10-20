import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnProfile } from '../api/student-portal.api';
import {
  listOwnComplaints,
  getOwnComplaint,
  getOwnComplaintHistory,
} from '../api/own-complaints.api';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
import {
  complaintFixture as row,
  complaintPage,
  createdUpdate,
} from '../../../test/fixtures/complaints';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/student-portal.api', async (original) => ({
  ...(await original<typeof import('../api/student-portal.api')>()),
  getOwnProfile: vi.fn(),
}));
vi.mock('../api/own-complaints.api', async (original) => ({
  ...(await original<typeof import('../api/own-complaints.api')>()),
  listOwnComplaints: vi.fn(),
  getOwnComplaint: vi.fn(),
  getOwnComplaintHistory: vi.fn(),
}));
const account = {
  user_id: row.submitted_by,
  firebase_uid: 'student-uid',
  email: 'student@example.edu',
  role: 'student' as const,
  is_active: true as const,
};
const paths = [
  '/student/complaints',
  '/student/complaints/new',
  `/student/complaints/${row.complaint_id}`,
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(account);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(getOwnProfile).mockResolvedValue({
    ...ownStudentProfile,
    student_id: row.student_id,
  });
  vi.mocked(listOwnComplaints).mockResolvedValue(complaintPage([row]));
  vi.mocked(getOwnComplaint).mockResolvedValue(row);
  vi.mocked(getOwnComplaintHistory).mockResolvedValue(
    complaintPage([createdUpdate]),
  );
});
it.each(paths)('opens protected student route %s', async (path) => {
  window.history.replaceState({}, '', path);
  render(<App />);
  expect(
    await screen.findByRole('heading', {
      name: path.endsWith('/new')
        ? 'New complaint'
        : path === paths[0]
          ? 'My complaints'
          : 'Complaint details',
      level: 2,
    }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Complaints' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.queryByRole('button', { name: 'Change status' }),
  ).not.toBeInTheDocument();
});
it.each(paths)('redirects signed-out access from %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  window.history.replaceState({}, '', path);
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
  ).toBeVisible();
  expect(window.location.pathname).toBe('/login');
  expect(listOwnComplaints).not.toHaveBeenCalled();
  expect(getOwnComplaint).not.toHaveBeenCalled();
});
it('rejects staff access to student complaint pages before owned reads', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'admin',
  });
  window.history.replaceState({}, '', paths[0]);
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Admin dashboard' }),
  ).toBeVisible();
  expect(getOwnProfile).not.toHaveBeenCalled();
  expect(listOwnComplaints).not.toHaveBeenCalled();
});
it('requires student setup before complaint submission', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    setup_required: true,
  });
  window.history.replaceState({}, '', paths[1]);
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: /Complete.*setup/i }),
  ).toBeVisible();
  expect(listOwnComplaints).not.toHaveBeenCalled();
  expect(getOwnProfile).not.toHaveBeenCalled();
});
