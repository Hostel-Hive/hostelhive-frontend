import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudentAttendance from './StudentAttendance';
import {
  AttendanceError,
  getStudentPresence,
  getStudentScans,
} from '../api/student-attendance.api';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import { studentFixture } from '../../../test/fixtures/student';
import {
  presenceFixture,
  scanFixture,
  scanPage,
  twentyScans,
} from '../../../test/fixtures/attendance';
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../auth/hooks/useAuth', () => ({ default: () => ({ signOut }) }));
vi.mock('../api/student-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/student-attendance.api')>()),
  getStudentPresence: vi.fn(),
  getStudentScans: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStudentPresence).mockResolvedValue(presenceFixture);
  vi.mocked(getStudentScans).mockResolvedValue(scanPage([scanFixture]));
});
function show() {
  return render(
    <StudentAttendance studentID={studentFixture.student_id} uid="staff-uid" />,
  );
}
async function load() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Load attendance' }),
  );
}
it('links a recorded incident to the staff detail screen', async () => {
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  vi.mocked(getStudentScans).mockResolvedValue(
    scanPage([
      { ...scanFixture, incident_id: id, access_result: 'unapproved' },
    ]),
  );
  render(
    <MemoryRouter>
      <StudentAttendance
        studentID={studentFixture.student_id}
        uid="staff-uid"
      />
    </MemoryRouter>,
  );
  await load();
  expect(await screen.findByRole('link', { name: id })).toHaveAttribute(
    'href',
    `/dashboard/attendance/incidents/${id}`,
  );
});
it('waits for explicit read-only retrieval and displays authoritative presence plus legacy assessments', async () => {
  show();
  expect(getStudentPresence).not.toHaveBeenCalled();
  expect(getStudentScans).not.toHaveBeenCalled();
  await load();
  expect(
    await within(
      screen.getByRole('region', { name: 'Recorded presence' }),
    ).findByText('IN'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Recorded movement')).toBeInTheDocument();
  expect(screen.getByText('Not specified')).toBeInTheDocument();
  expect(getStudentScans).toHaveBeenCalledWith(
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
    0,
  );
});
it('never treats UNKNOWN as OUT or an error as UNKNOWN', async () => {
  vi.mocked(getStudentPresence).mockResolvedValue({
    ...presenceFixture,
    status: 'UNKNOWN',
    updated_at: null,
  });
  vi.mocked(getStudentScans).mockResolvedValue(scanPage());
  show();
  await load();
  await screen.findByText('UNKNOWN');
  expect(screen.getByText(/UNKNOWN does not mean OUT/)).toBeInTheDocument();
  expect(
    screen.getByText('No scan history for this student.'),
  ).toBeInTheDocument();
});
it('separates ignored attempts from movements and does not derive presence from the latest scan', async () => {
  vi.mocked(getStudentScans).mockResolvedValue(
    scanPage([
      {
        ...scanFixture,
        direction: 'OUT',
        outcome: 'cooldown',
        access_result: 'not_evaluated',
      },
      {
        ...scanFixture,
        event_id: studentFixture.user_id,
        outcome: 'already_in',
      },
      {
        ...scanFixture,
        event_id: studentFixture.student_id,
        direction: 'OUT',
        outcome: 'already_out',
      },
    ]),
  );
  show();
  await load();
  expect(await screen.findByText('Ignored: cooldown')).toBeInTheDocument();
  expect(screen.getByText('Ignored: already IN')).toBeInTheDocument();
  expect(screen.getByText('Ignored: already OUT')).toBeInTheDocument();
  expect(screen.getByText('Not evaluated')).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'Recorded presence' })).getByText(
      'IN',
    ),
  ).toBeInTheDocument();
});
it('reports approved, unapproved and not-required assessments without changing the result', async () => {
  vi.mocked(getStudentScans).mockResolvedValue(
    scanPage(
      ['approved', 'unapproved', 'not_required'].map((access_result, i) => ({
        ...twentyScans()[i],
        access_result: access_result as
          'approved' | 'unapproved' | 'not_required',
      })),
    ),
  );
  show();
  await load();
  await screen.findByText('Approved');
  expect(screen.getByText('Unapproved')).toBeInTheDocument();
  expect(screen.getByText('Not required')).toBeInTheDocument();
  expect(screen.getAllByText('Recorded movement')).toHaveLength(3);
});
it('preserves scan history when presence is temporarily unavailable and retries presence alone', async () => {
  vi.mocked(getStudentPresence).mockRejectedValueOnce(new Error('offline'));
  show();
  await load();
  await screen.findByRole('alert');
  expect(await screen.findByText('Recorded movement')).toBeInTheDocument();
  expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry presence' }));
  await within(
    screen.getByRole('region', { name: 'Recorded presence' }),
  ).findByText('IN');
  expect(getStudentScans).toHaveBeenCalledOnce();
});
it('preserves presence when history fails and retries the requested page only', async () => {
  vi.mocked(getStudentScans).mockRejectedValueOnce(
    new AttendanceError('unavailable', 'History unavailable.'),
  );
  show();
  await load();
  await screen.findByRole('alert');
  expect(
    within(screen.getByRole('region', { name: 'Recorded presence' })).getByText(
      'IN',
    ),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry scan history' }),
  );
  await screen.findByText('Recorded movement');
  expect(getStudentPresence).toHaveBeenCalledOnce();
});
it.each(['session', 'forbidden'] as const)(
  'clears both feeds and aborts other reads after %s rejection',
  async (kind) => {
    vi.mocked(getStudentPresence).mockRejectedValue(
      new AttendanceError(kind, 'Attendance access denied.'),
    );
    vi.mocked(getStudentScans).mockReturnValue(new Promise(() => {}));
    show();
    await load();
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('region', { name: 'Recorded presence' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Refresh attendance' }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(getStudentScans).mock.calls[0][2].aborted).toBe(true);
    if (kind === 'session') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Sign in again' }),
      );
      expect(signOut).toHaveBeenCalledOnce();
    }
  },
);
it('maps transport session rejection to sign-in recovery', async () => {
  vi.mocked(getStudentScans).mockRejectedValue(
    new AuthorizedRequestError('session', 'Session expired.'),
  );
  show();
  await load();
  expect(await screen.findByRole('alert')).toHaveTextContent('Session expired');
  expect(
    screen.getByRole('button', { name: 'Sign in again' }),
  ).toBeInTheDocument();
});
it('handles a missing profile without inventing empty history or presence', async () => {
  vi.mocked(getStudentPresence).mockRejectedValue(
    new AttendanceError(
      'not-found',
      'Attendance unavailable for this profile.',
    ),
  );
  vi.mocked(getStudentScans).mockRejectedValue(
    new AttendanceError('not-found', 'History unavailable for this profile.'),
  );
  show();
  await load();
  expect(await screen.findAllByRole('alert')).toHaveLength(2);
  expect(
    screen.queryByText('No scan history for this student.'),
  ).not.toBeInTheDocument();
});
it('paginates without a fake total and resets to the first page on refresh', async () => {
  vi.mocked(getStudentScans).mockImplementation(
    async (_id, _uid, _signal, offset = 0) =>
      offset ? scanPage([], offset) : scanPage(twentyScans(), 0, true),
  );
  show();
  await load();
  await screen.findByText('Page 1');
  await userEvent.click(screen.getByRole('button', { name: 'Next scans' }));
  await screen.findByText('No scans on this page. Use Previous to return.');
  expect(screen.getByRole('button', { name: 'Next scans' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous scans' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Previous scans' }));
  await screen.findByText('Page 1');
  await userEvent.click(screen.getByRole('button', { name: 'Next scans' }));
  await screen.findByText('Page 2');
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh attendance' }),
  );
  await screen.findByText('Page 1');
  expect(getStudentPresence).toHaveBeenCalledTimes(2);
});
it('distinguishes a shared event UUID from two scanners', async () => {
  vi.mocked(getStudentScans).mockResolvedValue(
    scanPage([
      scanFixture,
      { ...scanFixture, device_id: studentFixture.user_id },
    ]),
  );
  show();
  await load();
  expect(await screen.findAllByText('Recorded movement')).toHaveLength(2);
  expect(screen.getAllByText('Scan reference')).toHaveLength(2);
});
it('shows only current student/session data and aborts superseded requests', async () => {
  let finish!: (value: typeof presenceFixture) => void;
  vi.mocked(getStudentPresence).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: 'Load attendance' }));
  const signal = vi.mocked(getStudentPresence).mock.calls[0][2];
  view.rerender(
    <StudentAttendance studentID={studentFixture.user_id} uid="other-staff" />,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => finish(presenceFixture));
  expect(
    screen.queryByRole('region', { name: 'Recorded presence' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Load attendance' }),
  ).toBeInTheDocument();
});
it('aborts both reads on unmount and ignores late results', async () => {
  let finish!: (value: typeof presenceFixture) => void;
  vi.mocked(getStudentPresence).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: 'Load attendance' }));
  const calls = [
    vi.mocked(getStudentPresence).mock.calls[0][2],
    vi.mocked(getStudentScans).mock.calls[0][2],
  ];
  view.unmount();
  expect(calls.every((signal) => signal.aborted)).toBe(true);
  await act(async () => finish(presenceFixture));
});
