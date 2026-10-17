import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getStudent } from '../api/students.api';
import { getStudentQR } from '../api/student-qr.api';
import { studentFixture } from '../../../test/fixtures/student';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  getStudent: vi.fn(),
}));
vi.mock('../api/student-qr.api', () => ({ getStudentQR: vi.fn() }));
const NativeURL = URL;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:qr');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
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
  vi.mocked(getStudentQR).mockResolvedValue(
    new Blob(['png'], { type: 'image/png' }),
  );
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}?faculty=Science`,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['admin', 'warden'] as const)(
  'integrates the QR control into a verified %s profile without automatic issuance',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({
      user_id: 'staff',
      firebase_uid: 'staff-uid',
      email: 'staff@example.com',
      role,
      is_active: true,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Alex Morgan' });
    expect(getStudentQR).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
    const image = await screen.findByAltText(
      /Student identification QR code for Alex Morgan/,
    );
    fireEvent.load(image);
    expect(
      screen.getByRole('link', { name: 'Download QR PNG' }),
    ).toHaveAttribute('href', 'blob:qr');
    expect(getStudentQR).toHaveBeenCalledWith(
      studentFixture.student_id,
      'staff-uid',
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('link', { name: 'Back to students' }),
    ).toHaveAttribute('href', '/dashboard/students?faculty=Science');
  },
);
it('does not expose QR controls to a signed-out visitor', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(getStudent).not.toHaveBeenCalled();
  expect(getStudentQR).not.toHaveBeenCalled();
});
it('keeps inactive student details readable without requesting a QR', async () => {
  vi.mocked(getStudent).mockResolvedValue({
    ...studentFixture,
    account_active: false,
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Alex Morgan' });
  expect(screen.getByText('Inactive')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Show QR code' }),
  ).not.toBeInTheDocument();
  expect(getStudentQR).not.toHaveBeenCalled();
});
