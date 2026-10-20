import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import OwnAttendanceHistory from './OwnAttendanceHistory';
import {
  emptyHistoryFilters,
  getOwnAttendance,
} from '../api/own-attendance.api';
import type { OwnHistoryPage } from '../api/own-attendance.api';
import { StudentPortalError } from '../api/student-portal.api';
import { ownHistoryPage } from '../../../test/fixtures/ownAttendance';
vi.mock('../api/own-attendance.api', async (original) => ({
  ...(await original<typeof import('../api/own-attendance.api')>()),
  getOwnAttendance: vi.fn(),
}));
const denied = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage());
});
function open(uid = 'uid') {
  return render(<OwnAttendanceHistory uid={uid} onAccessError={denied} />);
}
const settled = () => screen.findByRole('button', { name: 'Refresh history' });
function dates(from: string, to: string) {
  fireEvent.change(screen.getByLabelText('From date'), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: to } });
}
it('automatically loads only owned recorded movements and uses hostel rather than device timezone', async () => {
  open();
  expect(screen.getByText('Loading your recorded movements…')).toBeVisible();
  await settled();
  expect(getOwnAttendance).toHaveBeenCalledExactlyOnceWith(
    'uid',
    expect.any(AbortSignal),
    emptyHistoryFilters,
    0,
  );
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Entry' })).toBeVisible();
  expect(screen.getByRole('cell', { name: 'Exit' })).toBeVisible();
  const row = ownHistoryPage().items[0];
  const formatted = new Intl.DateTimeFormat(undefined, {
    timeZone: 'Asia/Colombo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(row.occurred_at));
  expect(screen.getByText(formatted)).toHaveAttribute(
    'datetime',
    row.occurred_at,
  );
  expect(screen.queryByText(row.event_id)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
it('validates paired dates and keeps values without sending invalid filters', async () => {
  open();
  await settled();
  dates('2026-10-19', '');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent('both');
  expect(screen.getByRole('alert')).toHaveFocus();
  dates('2026-10-20', '2026-10-19');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent('on or after');
  expect(getOwnAttendance).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('From date')).toHaveValue('2026-10-20');
});
it('applies dates and direction, paginates, refreshes page 1 with applied filters and clears filters', async () => {
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage(0, 21));
  open();
  await settled();
  dates('2026-10-19', '2026-10-20');
  await userEvent.selectOptions(screen.getByLabelText('Direction'), 'IN');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await settled();
  const filters = { from: '2026-10-19', to: '2026-10-20', direction: 'IN' };
  expect(getOwnAttendance).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    filters,
    0,
  );
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage(20, 21));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await settled();
  expect(getOwnAttendance).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    filters,
    20,
  );
  expect(screen.getByText('Page 2')).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Movement history results' }),
  ).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  vi.mocked(getOwnAttendance).mockResolvedValue(ownHistoryPage(0, 21));
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await settled();
  expect(screen.getByText('Page 1')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await settled();
  dates('2026-10-01', '2026-10-02');
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh history' }),
  );
  await settled();
  expect(getOwnAttendance).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    filters,
    0,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await settled();
  expect(getOwnAttendance).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    emptyHistoryFilters,
    0,
  );
  expect(screen.getByLabelText('From date')).toHaveValue('');
  expect(screen.getByLabelText('Direction')).toHaveValue('');
});
it('clears stale rows, prevents duplicate reads and retries a failed request with filters intact', async () => {
  open();
  await settled();
  dates('2026-10-19', '2026-10-20');
  let finish!: (value: OwnHistoryPage) => void;
  vi.mocked(getOwnAttendance).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Apply filters' }),
  );
  expect(getOwnAttendance).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByLabelText('From date')).toBeDisabled();
  await act(async () => finish(ownHistoryPage()));
  vi.mocked(getOwnAttendance).mockRejectedValueOnce(
    new Error('private details'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh history' }),
  );
  expect(await screen.findByRole('alert')).not.toHaveTextContent(
    'private details',
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByLabelText('From date')).toHaveValue('2026-10-19');
  await userEvent.click(screen.getByRole('button', { name: 'Retry history' }));
  await settled();
  expect(getOwnAttendance).toHaveBeenLastCalledWith(
    'uid',
    expect.any(AbortSignal),
    { from: '2026-10-19', to: '2026-10-20', direction: '' },
    0,
  );
});
it('shows explicit empty history and a beyond-end page with a route back', async () => {
  vi.mocked(getOwnAttendance).mockResolvedValueOnce(ownHistoryPage(0, 0));
  const view = open();
  await settled();
  expect(screen.getByText(/No recorded movements found/)).toBeVisible();
  view.unmount();
  vi.mocked(getOwnAttendance)
    .mockResolvedValueOnce(ownHistoryPage(0, 21))
    .mockResolvedValueOnce(ownHistoryPage(20, 0));
  open();
  await settled();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await settled();
  expect(screen.getByText(/No movements on this page/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
});
it.each(['session', 'forbidden', 'setup'] as const)(
  'escalates %s to the portal guard and does not offer data retry',
  async (kind) => {
    const error = new StudentPortalError(kind, 'Verify access');
    vi.mocked(getOwnAttendance).mockRejectedValue(error);
    open();
    await screen.findByRole('alert');
    expect(denied).toHaveBeenCalledWith(error);
    expect(
      screen.getByRole('button', { name: 'Refresh history' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Retry history' }),
    ).not.toBeInTheDocument();
  },
);
it('handles archived/missing profiles with clear guidance and retry', async () => {
  vi.mocked(getOwnAttendance).mockRejectedValueOnce(
    new StudentPortalError('not-found', 'Missing'),
  );
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'unlinked or archived',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry history' }));
  await waitFor(() => expect(screen.getByRole('table')).toBeVisible());
});
it('aborts requests on account change/unmount and ignores late results and failures', async () => {
  let finish!: (value: OwnHistoryPage) => void;
  let fail!: (reason: Error) => void;
  vi.mocked(getOwnAttendance)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
  const view = open('first');
  const firstSignal = vi.mocked(getOwnAttendance).mock.calls[0][1];
  view.rerender(<OwnAttendanceHistory uid="second" onAccessError={denied} />);
  expect(firstSignal.aborted).toBe(true);
  await act(async () => finish(ownHistoryPage()));
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  const secondSignal = vi.mocked(getOwnAttendance).mock.calls[1][1];
  view.unmount();
  expect(secondSignal.aborted).toBe(true);
  await act(async () =>
    fail(new StudentPortalError('forbidden', 'Late denial')),
  );
  expect(denied).not.toHaveBeenCalled();
});
