import { listComplaintImages } from '../api/complaint-images.api';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import {
  getComplaint,
  listComplaints,
  listComplaintUpdates,
} from '../api/complaints.api';
import {
  complaintFixture,
  complaintPage,
  createdUpdate,
} from '../../../test/fixtures/complaints';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/complaints.api', async (original) => ({
  ...(await original<typeof import('../api/complaints.api')>()),
  getComplaint: vi.fn(),
  listComplaints: vi.fn(),
  listComplaintUpdates: vi.fn(),
}));
const staff = {
  user_id: 'staff',
  firebase_uid: 'staff-uid',
  email: 'staff@example.com',
  role: 'admin' as const,
  is_active: true as const,
};
vi.mock('../api/complaint-images.api', async (original) => ({
  ...(await original<typeof import('../api/complaint-images.api')>()),
  listComplaintImages: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listComplaintImages).mockResolvedValue({ items: [], version: 1 });
  vi.mocked(restoreStaffSession).mockResolvedValue(staff);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(getComplaint).mockResolvedValue(complaintFixture);
  vi.mocked(listComplaints).mockResolvedValue(
    complaintPage([complaintFixture]),
  );
  vi.mocked(listComplaintUpdates).mockResolvedValue(
    complaintPage([createdUpdate]),
  );
  window.history.replaceState({}, '', '/dashboard/complaints');
});
it.each(['admin', 'warden'] as const)(
  'allows verified %s complaint management',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...staff, role });
    window.history.replaceState(
      {},
      '',
      `/dashboard/complaints/${complaintFixture.complaint_id}`,
    );
    render(<App />);
    expect(
      await screen.findByRole('button', { name: 'Add note' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change status' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Complaints' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(getComplaint).toHaveBeenCalledWith(
      complaintFixture.complaint_id,
      'staff-uid',
      expect.any(AbortSignal),
    );
  },
);
it.each([
  '/dashboard/complaints',
  `/dashboard/complaints/${complaintFixture.complaint_id}`,
])('redirects signed-out visits to %s before fetching', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  window.history.replaceState({}, '', path);
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(getComplaint).not.toHaveBeenCalled();
  expect(listComplaintUpdates).not.toHaveBeenCalled();
  expect(listComplaints).not.toHaveBeenCalled();
});
it('loads the staff directory route', async () => {
  render(<App />);
  expect(await screen.findByRole('table')).toBeVisible();
  expect(listComplaints).toHaveBeenCalledWith(
    expect.any(URLSearchParams),
    'staff-uid',
    expect.any(AbortSignal),
  );
});
