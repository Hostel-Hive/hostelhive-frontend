import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  login,
  logout,
  restoreStaffSession,
  SessionRejectedError,
  subscribeStaffSession,
} from '../api/auth.api';
import {
  completeStudentSetup,
  StudentSetupError,
} from '../api/student-setup.api';
import { requestPasswordReset } from '../api/password.api';
import type { StudentAccount, StaffAccount } from '../auth.types';
import { getOwnProfile } from '../../student-portal/api/student-portal.api';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
import { getOwnAttendance } from '../../student-portal/api/own-attendance.api';
import { ownHistoryPage } from '../../../test/fixtures/ownAttendance';
import {
  listOwnLeaves,
  getOwnLeave,
} from '../../student-portal/api/own-leave.api';
import { ownLeaveFixture, ownLeavePage } from '../../../test/fixtures/ownLeave';
import {
  listOwnLateAccess,
  getOwnLateAccess,
} from '../../student-portal/api/own-late-access.api';
import {
  ownLateAccessFixture,
  ownLateAccessPage,
} from '../../../test/fixtures/ownLateAccess';
vi.mock('../../student-portal/api/own-late-access.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/own-late-access.api')
  >()),
  listOwnLateAccess: vi.fn(),
  getOwnLateAccess: vi.fn(),
}));
vi.mock('../../student-portal/api/own-leave.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/own-leave.api')
  >()),
  listOwnLeaves: vi.fn(),
  getOwnLeave: vi.fn(),
}));
vi.mock('../../student-portal/api/own-attendance.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/own-attendance.api')
  >()),
  getOwnAttendance: vi.fn(),
}));
vi.mock('../../student-portal/api/student-portal.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/student-portal.api')
  >()),
  getOwnProfile: vi.fn(),
}));
vi.mock('../api/auth.api', async (original) => ({
  ...(await original<typeof import('../api/auth.api')>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/student-setup.api', async (original) => ({
  ...(await original<typeof import('../api/student-setup.api')>()),
  completeStudentSetup: vi.fn(),
}));
vi.mock('../api/password.api', async (original) => ({
  ...(await original<typeof import('../api/password.api')>()),
  requestPasswordReset: vi.fn(),
}));
const student: StudentAccount = {
  user_id: 'student-id',
  firebase_uid: 'student-uid',
  email: 'resident@example.com',
  role: 'student',
  is_active: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnProfile).mockResolvedValue(ownStudentProfile);
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage());
  vi.mocked(listOwnLeaves).mockResolvedValue(ownLeavePage());
  vi.mocked(getOwnLeave).mockResolvedValue(ownLeaveFixture);
  vi.mocked(listOwnLateAccess).mockResolvedValue(ownLateAccessPage());
  vi.mocked(getOwnLateAccess).mockResolvedValue(ownLateAccessFixture);
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(logout).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
  });
  window.history.replaceState({}, '', '/login');
});
function open(path = '/login') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
it('navigates between separate student pages and highlights only the current route', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(student);
  open('/student');
  await screen.findByRole('button', { name: 'Refresh dashboard' });
  const user = userEvent.setup();
  for (const [label, path, title] of [
    ['My profile', '/student/profile', 'My profile'],
    ['Accommodation', '/student/accommodation', 'Accommodation'],
    ['My QR code', '/student/qr', 'My QR code'],
    ['Attendance', '/student/attendance', 'Attendance'],
    ['Leave requests', '/student/leaves', 'Leave requests'],
    ['Access requests', '/student/late-access-requests', 'Access requests'],
    ['Overview', '/student', 'Welcome to HostelHive.'],
  ]) {
    if (path === '/student/profile') {
      await user.click(
        screen.getByRole('button', { name: /^Account menu for/ }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'My profile' }));
    } else await user.click(screen.getByRole('link', { name: label }));
    const heading = await screen.findByRole('heading', {
      name: title,
      level: 1,
    });
    expect(window.location.pathname).toBe(path);
    expect(window.location.hash).toBe('');
    expect(heading).toHaveFocus();
    if (path !== '/student/profile')
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      );
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(
      1,
    );
    if (path === '/student/profile')
      expect(
        screen.queryByRole('button', { name: 'Show QR code' }),
      ).not.toBeInTheDocument();
  }
});
it.each([
  ['/student/profile', 'My profile'],
  ['/student/accommodation', 'Accommodation'],
  ['/student/qr', 'My QR code'],
  ['/student/attendance', 'Attendance'],
  ['/student/leaves', 'Leave requests'],
  ['/student/leaves/new', 'New leave request'],
  [`/student/leaves/${ownLeaveFixture.leave_id}`, 'Leave request'],
  ['/student/late-access-requests', 'Access requests'],
  ['/student/late-access-requests/new', 'New access request'],
  [
    `/student/late-access-requests/${ownLateAccessFixture.late_access_id}`,
    'Access request',
  ],
])('supports direct entry to %s', async (path, title) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(student);
  open(path);
  expect(
    await screen.findByRole('heading', { name: title, level: 1 }),
  ).toBeVisible();
  expect(window.location.pathname).toBe(path);
});
it.each(['/', '/student/login'])(
  'opens the canonical student login from %s and links to staff login',
  async (path) => {
    open(path);
    await screen.findByRole('button', { name: 'Sign in' });
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByText('Invited students only')).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Staff sign in' }));
    expect(window.location.pathname).toBe('/staff/login');
    expect(await screen.findByText('Hostel staff only')).toBeVisible();
    await userEvent.click(
      screen.getByRole('link', { name: 'Student sign in' }),
    );
    expect(window.location.pathname).toBe('/login');
  },
);
async function signIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), student.email);
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'Student-password!23',
  );
  await user.click(screen.getByLabelText('Keep me signed in'));
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}
it('signs students in with persistence, opens their landing page and signs out to student login', async () => {
  vi.mocked(login).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(student);
    return student;
  });
  open();
  const user = await signIn();
  expect(
    await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
  ).toBeVisible();
  expect(login).toHaveBeenCalledWith({
    email: student.email,
    password: 'Student-password!23',
    rememberMe: true,
    portal: 'student',
  });
  expect(window.location.pathname).toBe('/student');
  await user.click(screen.getByRole('button', { name: /^Account menu for/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
});
it('routes new sign-in to setup when the backend requires it', async () => {
  const pending = { ...student, setup_required: true };
  vi.mocked(login).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(pending);
    return pending;
  });
  open();
  await signIn();
  expect(
    await screen.findByRole('heading', {
      name: 'Complete your account setup.',
    }),
  ).toBeVisible();
  expect(window.location.pathname).toBe('/student/setup');
});
it.each(['/student', '/dashboard/students/new'])(
  'blocks pending student access from %s until setup and fresh account verification succeed',
  async (path) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({
      ...student,
      setup_required: true,
    });
    open(path);
    const button = await screen.findByRole('button', {
      name: 'Verify account setup',
    });
    expect(window.location.pathname).toBe('/student/setup');
    expect(
      screen.queryByRole('heading', { name: 'Add student' }),
    ).not.toBeInTheDocument();
    let finish!: () => void;
    vi.mocked(completeStudentSetup).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    await user.dblClick(button);
    expect(completeStudentSetup).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    vi.mocked(restoreStaffSession).mockResolvedValue(student);
    await act(async () => finish());
    expect(
      await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
    ).toBeVisible();
  },
);
it('keeps setup locked when completion is unverified, allows retry, and offers fresh sign-in', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...student,
    setup_required: true,
  });
  vi.mocked(completeStudentSetup).mockRejectedValue(
    new StudentSetupError(
      'pending',
      'Finish the email setup and sign in again.',
    ),
  );
  open('/student/setup');
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Verify account setup' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Finish the email setup',
  );
  expect(
    screen.getByRole('button', { name: 'Verify account setup' }),
  ).toBeEnabled();
  expect(window.location.pathname).toBe('/student/setup');
  await user.click(
    screen.getByRole('button', { name: 'Sign out and sign in again' }),
  );
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
});
it('does not unlock the portal if refreshed account still requires setup', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...student,
    setup_required: true,
  });
  vi.mocked(completeStudentSetup).mockResolvedValue(undefined);
  open('/student/setup');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Verify account setup' }),
  );
  await waitFor(() => expect(restoreStaffSession).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByRole('button', { name: 'Verify account setup' }),
  ).toBeEnabled();
  expect(window.location.pathname).toBe('/student/setup');
});
it.each(['admin', 'warden'] as const)(
  'routes existing %s sessions away from the student portal',
  async (role) => {
    const staff: StaffAccount = { ...student, role };
    vi.mocked(restoreStaffSession).mockResolvedValue(staff);
    open('/student/late-access-requests');
    await screen.findByRole('heading', {
      name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
      level: 1,
    });
    expect(window.location.pathname).toBe(`/dashboard/${role}`);
    expect(getOwnAttendance).not.toHaveBeenCalled();
    expect(listOwnLeaves).not.toHaveBeenCalled();
    expect(listOwnLateAccess).not.toHaveBeenCalled();
  },
);
it('requires student authentication for direct attendance entry', async () => {
  open('/student/attendance');
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
  expect(getOwnAttendance).not.toHaveBeenCalled();
});
it('requires student authentication for direct leave entry', async () => {
  open('/student/leaves/new');
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
  expect(listOwnLeaves).not.toHaveBeenCalled();
});
it('requires student authentication for direct access request entry', async () => {
  open('/student/late-access-requests/new');
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
  expect(listOwnLateAccess).not.toHaveBeenCalled();
});
it('keeps access requests behind required student setup', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...student,
    setup_required: true,
  });
  open('/student/late-access-requests');
  await screen.findByRole('button', { name: 'Verify account setup' });
  expect(window.location.pathname).toBe('/student/setup');
  expect(listOwnLateAccess).not.toHaveBeenCalled();
});
it('keeps student leave requests behind required setup', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...student,
    setup_required: true,
  });
  open('/student/leaves');
  await screen.findByRole('button', { name: 'Verify account setup' });
  expect(window.location.pathname).toBe('/student/setup');
  expect(listOwnLeaves).not.toHaveBeenCalled();
});
it('keeps attendance history behind required student setup', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...student,
    setup_required: true,
  });
  open('/student/attendance');
  await screen.findByRole('button', { name: 'Verify account setup' });
  expect(window.location.pathname).toBe('/student/setup');
  expect(getOwnAttendance).not.toHaveBeenCalled();
});
it('prevents a student from rendering staff inventory', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(student);
  open('/dashboard/inventory');
  await screen.findByRole('heading', { name: 'Welcome to HostelHive.' });
  expect(window.location.pathname).toBe('/student');
  expect(
    screen.queryByRole('navigation', { name: 'Primary navigation' }),
  ).not.toBeInTheDocument();
});
it('keeps anonymous input visible during focus checks and supports student password recovery', async () => {
  open();
  const user = userEvent.setup();
  const email = await screen.findByLabelText('Email');
  await user.type(email, student.email);
  let finish!: (value: null) => void;
  vi.mocked(restoreStaffSession).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(email).toBeVisible();
  expect(email).toHaveValue(student.email);
  await act(async () => finish(null));
  await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
  expect(window.location.pathname).toBe('/student/forgot-password');
  await user.type(screen.getByLabelText('Account email'), student.email);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(requestPasswordReset).toHaveBeenCalledWith(student.email, true);
  await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
  expect(window.location.pathname).toBe('/login');
});
it('redirects expired student sessions to student login', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(student);
  open('/student');
  await screen.findByRole('heading', { name: 'Welcome to HostelHive.' });
  vi.mocked(restoreStaffSession)
    .mockRejectedValueOnce(new SessionRejectedError('Expired'))
    .mockResolvedValue(null);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
});
