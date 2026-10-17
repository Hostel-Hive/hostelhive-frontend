import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getStudent } from '../../students/api/students.api';
import {
  getStudentPresence,
  getStudentScans,
} from '../api/student-attendance.api';
import { studentFixture } from '../../../test/fixtures/student';
import { presenceFixture, scanPage } from '../../../test/fixtures/attendance';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../../students/api/students.api', async (original) => ({
  ...(await original<typeof import('../../students/api/students.api')>()),
  getStudent: vi.fn(),
}));
vi.mock('../api/student-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/student-attendance.api')>()),
  getStudentPresence: vi.fn(),
  getStudentScans: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'staff',
    firebase_uid: 'staff-uid',
    email: 'staff@example.com',
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
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
  vi.mocked(getStudentPresence).mockResolvedValue(presenceFixture);
  vi.mocked(getStudentScans).mockResolvedValue(scanPage());
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}?faculty=Science`,
  );
});
it.each(['admin', 'warden'] as const)(
  'allows verified %s staff to read this student without auto-fetching or changing attendance',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({
      user_id: 'staff',
      firebase_uid: 'staff-uid',
      email: 'staff@example.com',
      role,
      is_active: true,
    });
    render(<App />);
    const button = await screen.findByRole('button', {
      name: 'Load attendance',
    });
    expect(getStudentPresence).not.toHaveBeenCalled();
    expect(getStudentScans).not.toHaveBeenCalled();
    await userEvent.click(button);
    await screen.findByText('No scan history for this student.');
    expect(getStudentPresence).toHaveBeenCalledWith(
      studentFixture.student_id,
      'staff-uid',
      expect.any(AbortSignal),
    );
    expect(getStudentScans).toHaveBeenCalledWith(
      studentFixture.student_id,
      'staff-uid',
      expect.any(AbortSignal),
      0,
    );
    expect(
      screen.getByRole('link', { name: 'Back to students' }),
    ).toHaveAttribute('href', '/dashboard/students?faculty=Science');
  },
);
it('does not expose attendance to signed-out visitors', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(getStudentPresence).not.toHaveBeenCalled();
  expect(getStudentScans).not.toHaveBeenCalled();
});
it('lets authorized staff read retained attendance for an inactive student without QR or allocation prerequisites', async () => {
  vi.mocked(getStudent).mockResolvedValue({
    ...studentFixture,
    account_active: false,
  });
  render(<App />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Load attendance' }),
  );
  await screen.findByText('No scan history for this student.');
  expect(screen.getByText('Inactive')).toBeInTheDocument();
  expect(getStudentPresence).toHaveBeenCalledOnce();
});
