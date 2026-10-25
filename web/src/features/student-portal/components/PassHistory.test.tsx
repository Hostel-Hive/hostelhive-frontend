import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PassHistory from './PassHistory';
import { listOwnPasses } from '../api/pass-history.api';
import { StudentPortalError } from '../api/student-portal.api';
import {
  leavePass,
  accessPass,
  approvedPass,
  cancelledPass,
  passPage,
} from '../../../test/fixtures/passHistory';
vi.mock('../api/pass-history.api', async (original) => ({
  ...(await original<typeof import('../api/pass-history.api')>()),
  listOwnPasses: vi.fn(),
}));
const denied = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOwnPasses).mockResolvedValue(passPage());
});
function mount(search = '') {
  const router = createMemoryRouter(
    [
      {
        path: '/student/passes',
        element: (
          <PassHistory
            uid="student"
            studentID={leavePass.student_id}
            onAccessError={denied}
          />
        ),
      },
    ],
    { initialEntries: ['/student/passes' + search] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
it('renders mixed history and links to original records by type and source ID', async () => {
  mount();
  await screen.findByText('Family visit');
  const records = screen.getAllByRole('article');
  expect(records).toHaveLength(2);
  expect(
    within(records[0]).getByRole('link', { name: 'View original request' }),
  ).toHaveAttribute(
    'href',
    '/student/late-access-requests/' + accessPass.source_id,
  );
  expect(
    within(records[1]).getByRole('link', { name: 'View original request' }),
  ).toHaveAttribute('href', '/student/leaves/' + leavePass.source_id);
  expect(
    screen.getByText(/Going Home declarations are not included/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', {
      name: /Cancel request|Approve|Reject|Submit/,
    }),
  ).not.toBeInTheDocument();
});
it('shows Approved and Used separately, including scan and decision information', async () => {
  vi.mocked(listOwnPasses).mockResolvedValue(passPage([approvedPass]));
  mount();
  expect(
    await screen.findByText('Approved', { selector: '.pass-badge' }),
  ).toBeVisible();
  expect(screen.getByText('Used', { selector: '.pass-badge' })).toBeVisible();
  expect(screen.getByText('Used at scan')).toBeVisible();
  expect(screen.getByText(/Return through the main entrance/)).toBeVisible();
});
it('shows cancellation history without providing cancellation controls', async () => {
  vi.mocked(listOwnPasses).mockResolvedValue(passPage([cancelledPass]));
  mount();
  expect(
    await screen.findByText('Cancelled', { selector: '.pass-badge' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Cancel/ }),
  ).not.toBeInTheDocument();
});
it('applies filters server-side, preserves them in the URL and resets pagination', async () => {
  const { router } = mount('?offset=20');
  await screen.findByText('Family visit');
  await userEvent.selectOptions(
    screen.getByLabelText('Request type'),
    'late_access',
  );
  await waitFor(() =>
    expect(listOwnPasses).toHaveBeenLastCalledWith(
      'student',
      leavePass.student_id,
      { type: 'late_access', status: '', offset: 0 },
      expect.any(AbortSignal),
    ),
  );
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'cancelled');
  await waitFor(() =>
    expect(router.state.location.search).toContain('status=cancelled'),
  );
  expect(router.state.location.search).not.toContain('offset');
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(router.state.location.search).toBe(''));
});
it('uses combined pagination and refreshes to page one with filters retained', async () => {
  vi.mocked(listOwnPasses).mockImplementation(async (_uid, _student, query) =>
    passPage([approvedPass], query.offset, 21),
  );
  const { router } = mount('?status=approved');
  await screen.findByText('Used', { selector: '.pass-badge' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(router.state.location.search).toContain('offset=20'),
  );
  await screen.findByText('Page 2');
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh history' }),
  );
  await waitFor(() =>
    expect(listOwnPasses).toHaveBeenLastCalledWith(
      'student',
      leavePass.student_id,
      { type: '', status: 'approved', offset: 0 },
      expect.any(AbortSignal),
    ),
  );
});
it('clears private records and informs the portal after access rejection', async () => {
  mount();
  await screen.findByText('Family visit');
  vi.mocked(listOwnPasses).mockRejectedValue(
    new StudentPortalError('forbidden', 'Student access revoked'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh history' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Student access revoked',
  );
  expect(screen.queryByText('Family visit')).not.toBeInTheDocument();
  expect(denied).toHaveBeenCalledTimes(1);
});
it('rejects invalid URL filters without making a request and can clear them', async () => {
  mount('?status=consumed');
  expect(screen.getByRole('alert')).toHaveTextContent('invalid');
  expect(listOwnPasses).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await screen.findByText('Family visit');
});
it('supports empty records and retries transient failures', async () => {
  vi.mocked(listOwnPasses)
    .mockRejectedValueOnce(
      new StudentPortalError('unavailable', 'Temporarily unavailable'),
    )
    .mockResolvedValueOnce(passPage([]));
  mount();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry history' }),
  );
  expect(await screen.findByText('No matching records')).toBeVisible();
  expect(denied).not.toHaveBeenCalled();
});
it('aborts previous filter requests and ignores late results', async () => {
  let finish!: (value: ReturnType<typeof passPage>) => void;
  vi.mocked(listOwnPasses)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(passPage([approvedPass]));
  mount();
  const first = vi.mocked(listOwnPasses).mock.calls[0][3];
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved');
  await screen.findByText('Used', { selector: '.pass-badge' });
  expect(first.aborted).toBe(true);
  await act(async () => finish(passPage()));
  expect(screen.queryByText('Family visit')).not.toBeInTheDocument();
});
it('aborts pending history reads on unmount', () => {
  vi.mocked(listOwnPasses).mockImplementation(() => new Promise(() => {}));
  const view = mount();
  const signal = vi.mocked(listOwnPasses).mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
});
