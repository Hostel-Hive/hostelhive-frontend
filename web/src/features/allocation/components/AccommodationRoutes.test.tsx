import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getStudent } from '../../students/api/students.api';
import { listAllocations, changeAllocation } from '../api/allocation.api';
import { studentFixture } from '../../../test/fixtures/student';
import { allocationPage } from '../../../test/fixtures/allocation';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../../students/api/students.api', async (original) => ({
  ...(await original<typeof import('../../students/api/students.api')>()),
  getStudent: vi.fn(),
}));
vi.mock('../api/allocation.api', async (original) => ({
  ...(await original<typeof import('../api/allocation.api')>()),
  listAllocations: vi.fn(),
  changeAllocation: vi.fn(),
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
  vi.mocked(listAllocations).mockResolvedValue(allocationPage());
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}?faculty=Science`,
  );
});
it.each(['admin', 'warden'] as const)(
  'connects a verified %s student profile to its allocation module',
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
      name: 'Load accommodation',
    });
    expect(listAllocations).not.toHaveBeenCalled();
    await userEvent.click(button);
    await screen.findByText('No active bed allocation.');
    expect(listAllocations).toHaveBeenCalledWith(
      studentFixture.student_id,
      'staff-uid',
      expect.any(AbortSignal),
      0,
      true,
    );
    expect(
      screen.getByRole('link', { name: 'Back to students' }),
    ).toHaveAttribute('href', '/dashboard/students?faculty=Science');
    expect(changeAllocation).not.toHaveBeenCalled();
  },
);
it('redirects an unauthenticated visitor before any allocation request', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(listAllocations).not.toHaveBeenCalled();
  expect(changeAllocation).not.toHaveBeenCalled();
});
