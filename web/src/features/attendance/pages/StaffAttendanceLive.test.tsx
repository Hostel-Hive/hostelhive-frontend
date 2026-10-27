import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import useAuth from '../../auth/hooks/useAuth';
import StaffAttendancePage from './StaffAttendancePage';
import { startAttendanceLive } from '../api/attendance-live';
import type { LiveCallbacks } from '../api/attendance-live';
import { AttendanceError } from '../api/student-attendance.api';
import { getPresenceSummary, listPresence } from '../api/staff-attendance.api';
import {
  staffPresence as row,
  staffSummary as summary,
  staffPage as page,
} from '../../../test/fixtures/staffAttendance';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/attendance-live', () => ({ startAttendanceLive: vi.fn() }));
vi.mock('../api/staff-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/staff-attendance.api')>()),
  getPresenceSummary: vi.fn(),
  listPresence: vi.fn(),
}));
let handlers: LiveCallbacks;
const stop = vi.fn();
function auth(uid = 'uid', role: 'admin' | 'warden' | 'student' = 'admin') {
  vi.mocked(useAuth).mockReturnValue({
    account: {
      firebase_uid: uid,
      user_id: 'staff',
      email: 'staff@example.edu',
      role,
      is_active: true,
    },
    status: 'authenticated',
    message: '',
    verifiedPath: '/dashboard/attendance',
    busy: false,
    signIn: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  vi.mocked(getPresenceSummary).mockResolvedValue(summary);
  vi.mocked(listPresence).mockResolvedValue(page([row]));
  vi.mocked(startAttendanceLive).mockImplementation((_uid, callbacks) => {
    handlers = callbacks;
    return stop;
  });
});
const element = () => (
  <MemoryRouter>
    <StaffAttendancePage />
  </MemoryRouter>
);
async function open() {
  const view = render(element());
  await screen.findByText(row.full_name);
  fireEvent.click(screen.getByRole('button', { name: 'Enable live updates' }));
  return view;
}
it('keeps current rows visible and preserves focus during a background live refresh', async () => {
  await open();
  const input = screen.getByLabelText('Search name or Student ID');
  input.focus();
  let resolve!: (v: ReturnType<typeof page<typeof row>>) => void;
  vi.mocked(listPresence).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  act(() => handlers.invalidate());
  await waitFor(() => expect(listPresence).toHaveBeenCalledTimes(2));
  expect(screen.getByText(row.full_name)).toBeVisible();
  expect(input).toHaveFocus();
  expect(screen.getByText('Updating attendance records…')).toBeVisible();
  await act(async () =>
    resolve(page([{ ...row, full_name: 'Updated student' }])),
  );
  expect(await screen.findByText('Updated student')).toBeVisible();
  expect(
    screen.queryByText('Updating attendance records…'),
  ).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});
it('refreshes both endpoints with applied filters and preserves the current page', async () => {
  vi.mocked(listPresence).mockResolvedValue(page([row], 0, 40));
  await open();
  fireEvent.change(screen.getByLabelText('Search name or Student ID'), {
    target: { value: ' Sample ' },
  });
  fireEvent.change(screen.getByLabelText('Recorded status'), {
    target: { value: 'OUT' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await screen.findByText(row.full_name);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText(row.full_name);
  fireEvent.change(screen.getByLabelText('Search name or Student ID'), {
    target: { value: 'Unsaved draft' },
  });
  act(() => handlers.invalidate());
  await waitFor(() => expect(listPresence).toHaveBeenCalledTimes(4));
  expect(listPresence).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    'Sample',
    'OUT',
    20,
  );
  expect(getPresenceSummary).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    'Sample',
  );
  expect(screen.getByText('Page 2')).toBeVisible();
  expect(screen.getByLabelText('Search name or Student ID')).toHaveValue(
    'Unsaved draft',
  );
});
it('clears private rows and stops the feed when a live REST refresh denies access', async () => {
  await open();
  vi.mocked(listPresence).mockRejectedValueOnce(
    new AttendanceError('forbidden', 'Access removed'),
  );
  act(() => handlers.invalidate());
  expect(await screen.findByRole('alert')).toHaveTextContent('Access removed');
  expect(screen.queryByText(row.full_name)).not.toBeInTheDocument();
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
});
it('clears rows on session rejection from the feed and offers account verification', async () => {
  await open();
  act(() => handlers.denied(new AttendanceError('session', 'Session changed')));
  expect(screen.queryByText(row.full_name)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Verify account access' }),
  ).toBeVisible();
  expect(stop).toHaveBeenCalledTimes(1);
});
it('stops and resets live opt-in on UID/role changes and blocks students', async () => {
  const view = await open();
  auth('other', 'warden');
  view.rerender(element());
  await screen.findByText(row.full_name);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Enable live updates' }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(listPresence).toHaveBeenLastCalledWith(
    'other',
    expect.any(AbortSignal),
    '',
    '',
    0,
  );
  auth('student', 'student');
  view.rerender(element());
  expect(screen.getByRole('alert')).toHaveTextContent('Admin or Warden');
  expect(screen.queryByText(row.full_name)).not.toBeInTheDocument();
});
it('aborts an in-flight background read and ignores its late completion on navigation', async () => {
  const view = await open();
  let resolve!: (v: ReturnType<typeof page<typeof row>>) => void;
  vi.mocked(listPresence).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  act(() => handlers.invalidate());
  await waitFor(() => expect(listPresence).toHaveBeenCalledTimes(2));
  const signal = vi.mocked(listPresence).mock.lastCall![1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
  await act(async () => resolve(page([{ ...row, full_name: 'Late result' }])));
  expect(screen.queryByText('Late result')).not.toBeInTheDocument();
});
