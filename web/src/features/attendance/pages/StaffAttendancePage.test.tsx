import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import useAuth from '../../auth/hooks/useAuth';
import StaffAttendancePage from './StaffAttendancePage';
import { AttendanceError } from '../api/student-attendance.api';
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
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/staff-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/staff-attendance.api')>()),
  getIncident: vi.fn(),
  getPresenceSummary: vi.fn(),
  listIncidents: vi.fn(),
  listPresence: vi.fn(),
}));
const account = {
  user_id: 'staff-id',
  firebase_uid: 'uid',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
const verify = vi.fn();
const signOut = vi.fn();
function auth(role: 'admin' | 'warden' | 'student' = 'admin', uid = 'uid') {
  vi.mocked(useAuth).mockReturnValue({
    account: { ...account, role, firebase_uid: uid },
    status: 'authenticated',
    message: '',
    verifiedPath: '/dashboard/attendance',
    busy: false,
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(getPresenceSummary).mockResolvedValue(summary);
  vi.mocked(listPresence).mockResolvedValue(page([row]));
  vi.mocked(listIncidents).mockResolvedValue(page([incident]));
  vi.mocked(getIncident).mockResolvedValue(incident);
});
function open(path = '/dashboard/attendance') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/attendance', element: <StaffAttendancePage /> },
      {
        path: '/dashboard/attendance/incidents',
        element: <StaffAttendancePage view="incidents" />,
      },
      {
        path: '/dashboard/attendance/incidents/:incidentID',
        element: <StaffAttendancePage view="incident" />,
      },
      {
        path: '/dashboard/students/:studentID',
        element: <p>Student profile page</p>,
      },
    ],
    { initialEntries: [path] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
it.each(['admin', 'warden'] as const)(
  'shows backend counts and recorded presence for %s',
  async (role) => {
    auth(role);
    open();
    expect(await screen.findByText(row.full_name)).toBeVisible();
    const summaryList = screen.getByLabelText('Backend presence counts');
    expect(summaryList).toHaveTextContent('Total students10IN6OUT3UNKNOWN1');
    expect(screen.getByRole('link', { name: row.full_name })).toHaveAttribute(
      'href',
      `/dashboard/students/${row.student_id}`,
    );
    expect(
      screen.getByText(/not a guarantee of physical location/),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  },
);
it('applies search to both endpoints and status only to the list', async () => {
  open();
  await screen.findByText(row.full_name);
  fireEvent.change(screen.getByLabelText('Search name or Student ID'), {
    target: { value: ' Sample ' },
  });
  fireEvent.change(screen.getByLabelText('Recorded status'), {
    target: { value: 'IN' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(getPresenceSummary).toHaveBeenLastCalledWith(
      'uid',
      expect.any(AbortSignal),
      'Sample',
    ),
  );
  expect(listPresence).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    'Sample',
    'IN',
    0,
  );
  await screen.findByText(row.full_name);
  expect(
    screen.getByRole('region', { name: 'Presence results' }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(listPresence).toHaveBeenLastCalledWith(
      'uid',
      expect.any(AbortSignal),
      '',
      '',
      0,
    ),
  );
  expect(screen.getByLabelText('Search name or Student ID')).toHaveValue('');
});
it('rejects invalid search while preserving entered values and current results', async () => {
  open();
  await screen.findByText(row.full_name);
  fireEvent.change(screen.getByLabelText('Search name or Student ID'), {
    target: { value: 'a'.repeat(201) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent('200 characters');
  expect(listPresence).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Search name or Student ID')).toHaveValue(
    'a'.repeat(201),
  );
});
it('refreshes the summary and list together, and retains applied filters', async () => {
  open();
  await screen.findByText(row.full_name);
  fireEvent.change(screen.getByLabelText('Search name or Student ID'), {
    target: { value: 'Sample' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await screen.findByText(row.full_name);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh attendance' }));
  await waitFor(() => expect(listPresence).toHaveBeenCalledTimes(3));
  expect(getPresenceSummary).toHaveBeenCalledTimes(3);
  expect(getPresenceSummary).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    'Sample',
  );
});
it('paginates and refresh returns to page 1 without deriving counts from page rows', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    ...row,
    student_id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    full_name: `Student ${i}`,
  }));
  vi.mocked(listPresence).mockImplementation(
    async (_uid, _signal, _q, _status, offset = 0) =>
      offset ? page([], offset, 21) : page(items, 0, 21),
  );
  open();
  await screen.findByText('Student 0');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(
    await screen.findByText(
      'No students on this page. Use Previous or refresh.',
    ),
  ).toBeVisible();
  expect(screen.getByText('Page 2')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Student 0');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh attendance' }));
  await screen.findByText('Student 0');
  expect(screen.getByText('Page 1')).toBeVisible();
  expect(screen.getByLabelText('Backend presence counts')).toHaveTextContent(
    'Total students10',
  );
});
it('displays UNKNOWN without treating missing presence as OUT', async () => {
  vi.mocked(listPresence).mockResolvedValue(
    page([{ ...row, status: 'UNKNOWN', updated_at: null }]),
  );
  open();
  expect(await screen.findByText('No recorded movement')).toBeVisible();
  expect(within(screen.getByRole('table')).getByText('UNKNOWN')).toBeVisible();
});
it('handles empty eligible students and list failures without invented zero counts', async () => {
  vi.mocked(listPresence)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(page([]));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.queryByLabelText('Backend presence counts')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry attendance' }));
  expect(
    await screen.findByText('No students match these filters.'),
  ).toBeVisible();
  expect(getPresenceSummary).toHaveBeenCalledTimes(2);
});
it('retries both reads after a summary failure and supports identical re-applied filters', async () => {
  vi.mocked(getPresenceSummary)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(summary);
  open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry attendance' }),
  );
  await screen.findByText(row.full_name);
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(getPresenceSummary).toHaveBeenCalledTimes(3));
});
it('links a selected presence student to incident filters', async () => {
  open();
  fireEvent.click(
    await screen.findByRole('link', {
      name: `View incidents for ${row.full_name}`,
    }),
  );
  await screen.findByRole('heading', { name: 'Recorded incidents' });
  expect(listIncidents).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    { studentID: row.student_id, direction: '', type: '' },
    0,
  );
  expect(screen.getByLabelText('Student profile ID')).toHaveValue(
    row.student_id,
  );
});
it('filters incidents using only supported fields and clears filters', async () => {
  open('/dashboard/attendance/incidents');
  await screen.findByText('Early exit without permission');
  fireEvent.change(screen.getByLabelText('Student profile ID'), {
    target: { value: row.student_id },
  });
  fireEvent.change(screen.getByLabelText('Direction'), {
    target: { value: 'OUT' },
  });
  fireEvent.change(screen.getByLabelText('Incident type'), {
    target: { value: 'early_exit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(listIncidents).toHaveBeenLastCalledWith(
      'uid',
      expect.any(AbortSignal),
      { studentID: row.student_id, direction: 'OUT', type: 'early_exit' },
      0,
    ),
  );
  await screen.findByText('Early exit without permission');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(listIncidents).toHaveBeenLastCalledWith(
      'uid',
      expect.any(AbortSignal),
      { studentID: '', direction: '', type: '' },
      0,
    ),
  );
});
it('preserves an invalid incident filter and does not submit it', async () => {
  open('/dashboard/attendance/incidents');
  await screen.findByText('Early exit without permission');
  fireEvent.change(screen.getByLabelText('Student profile ID'), {
    target: { value: 'bad' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent('UUID');
  expect(listIncidents).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Student profile ID')).toHaveValue('bad');
});
it('paginates incidents, refreshes and handles empty pages', async () => {
  vi.mocked(listIncidents).mockImplementation(
    async (_uid, _signal, _filters, offset = 0) =>
      offset ? page([], offset, 21) : page([incident], 0, 21),
  );
  open('/dashboard/attendance/incidents');
  await screen.findByText('Early exit without permission');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(
    await screen.findByText(
      'No incidents on this page. Use Previous or refresh.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Early exit without permission');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh incidents' }));
  await screen.findByText('Early exit without permission');
  vi.mocked(listIncidents).mockResolvedValue(page([]));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh incidents' }));
  expect(
    await screen.findByText('No incidents match these filters.'),
  ).toBeVisible();
});
it('displays recorded policy rather than making up current settings or resolution controls', async () => {
  open('/dashboard/attendance/incidents');
  fireEvent.click(
    await screen.findByRole('link', { name: 'Early exit without permission' }),
  );
  expect(await screen.findByText('Asia/Colombo')).toBeVisible();
  expect(screen.getByText('06:00')).toBeVisible();
  expect(screen.getByText('20:00')).toBeVisible();
  expect(
    screen.getByText('±30 minutes around expected movement time'),
  ).toBeVisible();
  expect(screen.getByText(incident.device_id)).toBeVisible();
  expect(screen.getByText(incident.event_id)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /resolve|edit|scan/i }),
  ).toBeNull();
  expect(
    screen.getByRole('link', { name: 'View student profile' }),
  ).toHaveAttribute('href', `/dashboard/students/${row.student_id}`);
});
it('supports late-entry snapshots and an unrecognized stored timezone without crashing', async () => {
  vi.mocked(getIncident).mockResolvedValue({
    ...incident,
    direction: 'IN',
    incident_type: 'late_entry',
    hostel_timezone: 'Local',
  });
  open(`/dashboard/attendance/incidents/${incident.incident_id}`);
  expect(
    await screen.findByText('Late entry without permission'),
  ).toBeVisible();
  expect(screen.getByText(/stored timezone cannot be formatted/)).toBeVisible();
});
it('handles missing incidents and failed detail refreshes without fabricating details', async () => {
  vi.mocked(getIncident)
    .mockRejectedValueOnce(
      new AttendanceError('not-found', 'Incident not found'),
    )
    .mockResolvedValue(incident);
  open(`/dashboard/attendance/incidents/${incident.incident_id}`);
  expect(await screen.findByRole('alert')).toHaveTextContent('not found');
  expect(screen.queryByText(incident.device_id)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry attendance' }));
  await screen.findByText(incident.device_id);
  vi.mocked(getIncident).mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh incident' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.queryByText(incident.device_id)).toBeNull();
});
it.each(['session', 'forbidden'] as const)(
  'clears private content when access becomes %s',
  async (kind) => {
    open();
    await screen.findByText(row.full_name);
    vi.mocked(listPresence).mockRejectedValue(
      new AttendanceError(kind, 'Access rejected'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh attendance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access rejected',
    );
    expect(screen.queryByText(row.full_name)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalled();
    vi.mocked(listPresence).mockResolvedValue(page([row]));
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify account access' }),
    );
    expect(await screen.findByText(row.full_name)).toBeVisible();
  },
);
it('aborts stale requests and ignores delayed results after an account switch', async () => {
  let finish!: (v: ReturnType<typeof page<typeof row>>) => void;
  vi.mocked(listPresence).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <MemoryRouter>
      <StaffAttendancePage />
    </MemoryRouter>,
  );
  const oldSignal = vi.mocked(listPresence).mock.calls[0][1];
  auth('warden', 'other');
  vi.mocked(listPresence).mockResolvedValue(page([]));
  view.rerender(
    <MemoryRouter>
      <StaffAttendancePage />
    </MemoryRouter>,
  );
  expect(oldSignal.aborted).toBe(true);
  expect(
    await screen.findByText('No students match these filters.'),
  ).toBeVisible();
  await act(async () => finish(page([row])));
  expect(screen.queryByText(row.full_name)).toBeNull();
});
it('discards private detail when unmounted', async () => {
  vi.mocked(getIncident).mockImplementationOnce(() => new Promise(() => {}));
  const view = open(`/dashboard/attendance/incidents/${incident.incident_id}`);
  const signal = vi.mocked(getIncident).mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it('refuses student/signed-out readers before any staff request', () => {
  auth('student');
  const view = open();
  expect(screen.getByRole('alert')).toHaveTextContent('Admin or Warden');
  expect(getPresenceSummary).not.toHaveBeenCalled();
  const value = vi.mocked(useAuth)();
  vi.mocked(useAuth).mockReturnValue({ ...value, account: null });
  view.rerender(
    <RouterProvider
      router={createMemoryRouter([
        { path: '/', element: <StaffAttendancePage /> },
      ])}
    />,
  );
  expect(getPresenceSummary).not.toHaveBeenCalled();
});
