import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnProfile } from '../../student-portal/api/student-portal.api';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
import {
  getIncident,
  getPresenceSummary,
  listIncidents,
  listPresence,
} from '../api/staff-attendance.api';
import {
  staffPresence as row,
  staffSummary as summary,
  incidentFixture as incident,
  staffPage as page,
} from '../../../test/fixtures/staffAttendance';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../../student-portal/api/student-portal.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/student-portal.api')
  >()),
  getOwnProfile: vi.fn(),
}));
vi.mock('../api/staff-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/staff-attendance.api')>()),
  getIncident: vi.fn(),
  getPresenceSummary: vi.fn(),
  listIncidents: vi.fn(),
  listPresence: vi.fn(),
}));
const account = {
  user_id: incident.device_id,
  firebase_uid: 'uid',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
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
  vi.mocked(getOwnProfile).mockResolvedValue(ownStudentProfile);
  vi.mocked(getPresenceSummary).mockResolvedValue(summary);
  vi.mocked(listPresence).mockResolvedValue(page([row]));
  vi.mocked(listIncidents).mockResolvedValue(page([incident]));
  vi.mocked(getIncident).mockResolvedValue(incident);
});
function at(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
it.each(['admin', 'warden'] as const)(
  'replaces %s placeholders with backend attendance data',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    at(`/dashboard/${role}`);
    expect(await screen.findByText(row.full_name)).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute(
      'href',
      '/dashboard/attendance',
    );
  },
);
it.each(['admin', 'warden'] as const)(
  'allows %s staff incident list and direct detail routes',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    const view = at('/dashboard/attendance/incidents');
    expect(
      await screen.findByRole('link', {
        name: 'Early exit without permission',
      }),
    ).toHaveAttribute(
      'href',
      `/dashboard/attendance/incidents/${incident.incident_id}`,
    );
    expect(screen.getByRole('link', { name: 'Attendance' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    view.unmount();
    at(`/dashboard/attendance/incidents/${incident.incident_id}`);
    expect(await screen.findByText(incident.device_id)).toBeVisible();
  },
);
it('offers a dedicated attendance dashboard route', async () => {
  at('/dashboard/attendance');
  expect(await screen.findByText(row.full_name)).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Attendance dashboard' }),
  ).toBeVisible();
});
it.each([
  '/dashboard/attendance',
  '/dashboard/attendance/incidents',
  `/dashboard/attendance/incidents/${incident.incident_id}`,
])('protects signed-out direct entry %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  at(path);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
  ).toBeVisible();
  expect(window.location.pathname).toBe('/staff/login');
  expect(getPresenceSummary).not.toHaveBeenCalled();
  expect(listIncidents).not.toHaveBeenCalled();
  expect(getIncident).not.toHaveBeenCalled();
});
it.each([
  '/dashboard/attendance',
  '/dashboard/attendance/incidents',
  `/dashboard/attendance/incidents/${incident.incident_id}`,
])('rejects student entry into staff route %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  at(path);
  expect(
    await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
  ).toBeVisible();
  expect(getPresenceSummary).not.toHaveBeenCalled();
  expect(listIncidents).not.toHaveBeenCalled();
  expect(getIncident).not.toHaveBeenCalled();
});
