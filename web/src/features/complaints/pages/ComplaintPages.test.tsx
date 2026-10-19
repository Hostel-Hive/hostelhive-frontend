import { act } from 'react';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import {
  ComplaintError,
  changeComplaint,
  getComplaint,
  listComplaints,
  listComplaintUpdates,
} from '../api/complaints.api';
import ComplaintListPage from './ComplaintListPage';
import ComplaintDetailPage from './ComplaintDetailPage';
import {
  complaintFixture as row,
  complaintActionID,
  complaintPage,
  createdUpdate,
  noteUpdate,
} from '../../../test/fixtures/complaints';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/complaints.api', async (original) => ({
  ...(await original<typeof import('../api/complaints.api')>()),
  changeComplaint: vi.fn(),
  getComplaint: vi.fn(),
  listComplaints: vi.fn(),
  listComplaintUpdates: vi.fn(),
}));
const get = vi.mocked(getComplaint),
  list = vi.mocked(listComplaints),
  history = vi.mocked(listComplaintUpdates),
  change = vi.mocked(changeComplaint);
const signOut = vi.fn();
const show = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  ),
  close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(complaintActionID);
  vi.mocked(useAuth).mockReturnValue({
    account: { firebase_uid: 'staff', role: 'admin' },
    signOut,
  } as unknown as ReturnType<typeof useAuth>);
  signOut.mockResolvedValue(undefined);
  get.mockResolvedValue(row);
  list.mockResolvedValue(complaintPage([row]));
  history.mockResolvedValue(complaintPage([createdUpdate]));
  change.mockResolvedValue(noteUpdate);
});
afterEach(() => vi.restoreAllMocks());
function mount(path = '/dashboard/complaints') {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/complaints', element: <ComplaintListPage /> },
      {
        path: '/dashboard/complaints/:complaintID',
        element: <ComplaintDetailPage />,
      },
      { path: '/other', element: <p>Other page</p> },
    ],
    { initialEntries: [path] },
  );
  return {
    ...render(<RouterProvider router={router} />),
    user: userEvent.setup(),
    router,
  };
}
const detail = `/dashboard/complaints/${row.complaint_id}`;
async function note(
  user: ReturnType<typeof userEvent.setup>,
  text = 'Repair assigned',
) {
  await user.click(await screen.findByRole('button', { name: 'Add note' }));
  await user.type(screen.getByLabelText('Note'), text);
  await user.click(screen.getByRole('button', { name: 'Review action' }));
}
it('filters by status/category/student/time and preserves filters on details/back navigation', async () => {
  const { user, router } = mount('/dashboard/complaints?offset=20');
  await screen.findByRole('table');
  await user.selectOptions(screen.getByLabelText('Status'), 'pending');
  await user.selectOptions(screen.getByLabelText('Category'), 'maintenance');
  await user.type(screen.getByLabelText('Student ID (UUID)'), row.student_id);
  fireEvent.change(screen.getByLabelText('Created from (inclusive)'), {
    target: { value: '2026-10-19T00:00' },
  });
  fireEvent.change(screen.getByLabelText('Created before (exclusive)'), {
    target: { value: '2026-10-20T00:00' },
  });
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(list.mock.calls.at(-1)![0].get('created_from')).toBe(
      new Date('2026-10-19T00:00').toISOString(),
    ),
  );
  expect(router.state.location.search).not.toContain('offset=20');
  await user.click(
    await screen.findByRole('link', {
      name: `View complaint ${row.complaint_id}`,
    }),
  );
  await screen.findByRole('heading', { name: 'Manage complaint' });
  expect(
    screen
      .getByRole('link', { name: 'Back to complaints' })
      .getAttribute('href'),
  ).toContain('category=maintenance');
});
it('paginates and clears directory filters', async () => {
  list.mockImplementation(async (params) =>
    complaintPage([row], Number(params.get('offset') ?? 0), 21),
  );
  const { user } = mount();
  await user.click(await screen.findByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 · 21 complaints');
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1 · 21 complaints');
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.click(screen.getByRole('button', { name: 'Refresh complaints' }));
});
it.each([
  ['', 0, 'No complaints yet.'],
  ['?status=resolved', 0, 'No complaints match these filters.'],
  ['?offset=20', 20, 'No complaints on this page. Go to the previous page.'],
] as const)(
  'shows appropriate empty list state %s',
  async (query, offset, message) => {
    list.mockResolvedValue(complaintPage([], offset));
    mount(`/dashboard/complaints${query}`);
    expect(await screen.findByText(message)).toBeVisible();
  },
);
it('shows loading and service retry', async () => {
  list
    .mockRejectedValueOnce(new Error('Private service failure'))
    .mockResolvedValue(complaintPage([row]));
  const { user } = mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('table')).toBeVisible();
});
it.each(['session', 'forbidden'] as const)(
  'denies list access for %s',
  async (kind) => {
    list.mockRejectedValue(new ComplaintError(kind, 'Access lost'));
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Apply filters' }),
    ).not.toBeInTheDocument();
  },
);
it('displays paginated oldest-first history including photo audit events without images', async () => {
  const image = {
    ...noteUpdate,
    action: 'image_added' as const,
    image_id: row.request_id,
  };
  history.mockImplementation(async (_id, _uid, _signal, offset = 0) =>
    complaintPage(offset ? [image] : [createdUpdate], offset, 21),
  );
  const { user } = mount(detail);
  await user.click(await screen.findByRole('button', { name: 'Next history' }));
  expect(
    await screen.findByRole('heading', { name: 'Photo attached' }),
  ).toBeVisible();
  expect(screen.getByText(`Photo reference: ${row.request_id}`)).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Previous history' }));
  await screen.findByRole('heading', { name: 'Complaint submitted' });
  await user.click(screen.getByRole('button', { name: 'Refresh complaint' }));
});
it('adds a note only after validation and confirmation and refreshes both feeds', async () => {
  const { user } = mount(detail);
  await user.click(await screen.findByRole('button', { name: 'Add note' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(
    within(screen.getByRole('dialog')).getByText(
      /visible to the owning student/,
    ),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Review action' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a note');
  await user.type(screen.getByLabelText('Note'), 'Repair assigned');
  await user.click(screen.getByRole('button', { name: 'Review action' }));
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Edit action' }));
  await user.click(screen.getByRole('button', { name: 'Review action' }));
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  expect(
    await screen.findByText(
      'Complaint action saved. Refreshing details and history.',
    ),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(change).toHaveBeenCalledWith(
    row,
    {
      request_id: complaintActionID,
      expected_version: 1,
      text: 'Repair assigned',
    },
    'staff',
    expect.any(AbortSignal),
  );
  expect(get).toHaveBeenCalledTimes(2);
  expect(history).toHaveBeenCalledTimes(2);
});
it.each(['pending', 'in_progress', 'resolved'] as const)(
  'offers only valid actions for %s',
  async (status) => {
    get.mockResolvedValue({ ...row, status });
    const { user } = mount(detail);
    await user.click(
      await screen.findByRole('button', {
        name: status === 'resolved' ? 'Reopen complaint' : 'Change status',
      }),
    );
    const select = screen.getByLabelText('Next status');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(
      status === 'pending'
        ? ['', 'in_progress', 'resolved']
        : status === 'resolved'
          ? ['', 'in_progress']
          : ['', 'resolved'],
    );
    if (status === 'resolved')
      expect(
        screen.queryByRole('button', { name: 'Add note' }),
      ).not.toBeInTheDocument();
  },
);
it.each(['pending', 'resolved'] as const)(
  'requires an explanation for resolution/reopening from %s',
  async (status) => {
    get.mockResolvedValue({ ...row, status });
    const { user } = mount(detail);
    await user.click(
      await screen.findByRole('button', {
        name: status === 'resolved' ? 'Reopen complaint' : 'Change status',
      }),
    );
    if (status === 'pending')
      await user.selectOptions(
        screen.getByLabelText('Next status'),
        'resolved',
      );
    await user.click(screen.getByRole('button', { name: 'Review action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('explanation');
    await user.type(screen.getByLabelText('Explanation'), 'Reviewed issue');
    await user.click(screen.getByRole('button', { name: 'Review action' }));
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
    expect(change.mock.calls[0][1].status).toBe(
      status === 'pending' ? 'resolved' : 'in_progress',
    );
  },
);
it('blocks overlong notes before sending', async () => {
  const { user } = mount(detail);
  await user.click(await screen.findByRole('button', { name: 'Add note' }));
  fireEvent.change(screen.getByLabelText('Note'), {
    target: { value: 'a'.repeat(2001) },
  });
  await user.click(screen.getByRole('button', { name: 'Review action' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('2000');
  expect(change).not.toHaveBeenCalled();
});
it('requires fresh state and a new UUID after a conflict while preserving the draft', async () => {
  vi.mocked(crypto.randomUUID)
    .mockReturnValueOnce(complaintActionID)
    .mockReturnValueOnce('99999999-9999-4999-8999-999999999999');
  get.mockResolvedValueOnce(row).mockResolvedValue({ ...row, version: 2 });
  change
    .mockRejectedValueOnce(new ComplaintError('conflict', 'Stale version'))
    .mockResolvedValue(noteUpdate);
  const { user } = mount(detail);
  await note(user);
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  await screen.findByRole('button', { name: 'Reload complaint and history' });
  expect(screen.getByRole('button', { name: 'Review action' })).toBeDisabled();
  expect(screen.getByLabelText('Note')).toHaveValue('Repair assigned');
  await user.click(
    screen.getByRole('button', { name: 'Reload complaint and history' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review action' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Review action' }));
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(change.mock.calls[1][1]).toMatchObject({
    expected_version: 2,
    request_id: '99999999-9999-4999-8999-999999999999',
    text: 'Repair assigned',
  });
});
it('preserves the exact original payload/UUID for an uncertain retry even after later resolution', async () => {
  get
    .mockResolvedValueOnce(row)
    .mockResolvedValue({ ...row, status: 'resolved', version: 3 });
  change
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockResolvedValue(noteUpdate);
  const { user } = mount(detail);
  await note(user);
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'may have been saved',
  );
  expect(screen.getByLabelText('Note')).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload complaint and history' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Review identical retry' }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole('button', { name: 'Review identical retry' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Confirm identical retry' }),
  );
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(change.mock.calls[1][0]).toEqual(row);
  expect(change.mock.calls[1][1]).toEqual(change.mock.calls[0][1]);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});
it('keeps failed uncertainty rechecks locked and retains text', async () => {
  get.mockResolvedValueOnce(row).mockRejectedValue(new Error('Read failure'));
  change.mockRejectedValue(new Error('Lost response'));
  const { user } = mount(detail);
  await note(user);
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  await user.click(
    await screen.findByRole('button', { name: 'Reload complaint and history' }),
  );
  await screen.findByRole('alert');
  expect(
    screen.getByRole('button', { name: 'Review identical retry' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Note')).toHaveValue('Repair assigned');
});
it.each(['session', 'forbidden', 'not-found'] as const)(
  'clears details/draft after write %s',
  async (kind) => {
    change.mockRejectedValue(
      new ComplaintError(kind, 'Access or complaint lost'),
    );
    const { user } = mount(detail);
    await note(user);
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access or complaint lost',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Manage complaint' }),
    ).not.toBeInTheDocument();
  },
);
it('removes all details if history authorization fails', async () => {
  history.mockRejectedValue(new ComplaintError('forbidden', 'History denied'));
  mount(detail);
  expect(await screen.findByRole('alert')).toHaveTextContent('History denied');
  expect(
    screen.queryByRole('heading', { name: 'Manage complaint' }),
  ).not.toBeInTheDocument();
});
it('retains editable text after server validation failure', async () => {
  change.mockRejectedValue(new ComplaintError('invalid', 'Check explanation'));
  const { user } = mount(detail);
  await note(user);
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Check explanation',
  );
  expect(screen.getByLabelText('Note')).toHaveValue('Repair assigned');
  expect(screen.getByLabelText('Note')).toBeEnabled();
});
it('blocks duplicate writes, Escape and navigation while saving', async () => {
  let finish!: (value: typeof noteUpdate) => void;
  change.mockImplementation(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const { user, router } = mount(detail);
  await note(user);
  await user.dblClick(screen.getByRole('button', { name: 'Confirm action' }));
  expect(change).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await act(async () => {
    await router.navigate('/other');
  });
  expect(
    await screen.findByText('Wait for the current operation before leaving.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Stay here' }));
  await act(async () => finish(noteUpdate));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
it('protects dirty notes and allows explicit discard', async () => {
  const { user, router } = mount(detail);
  await note(user);
  await act(async () => {
    await router.navigate('/other');
  });
  await user.click(
    await screen.findByRole('button', { name: 'Discard and leave' }),
  );
  expect(await screen.findByText('Other page')).toBeVisible();
  expect(change).not.toHaveBeenCalled();
});
it('restores focus on Escape and ignores stale details after changing complaint', async () => {
  const { user, router } = mount(detail);
  await user.click(await screen.findByRole('button', { name: 'Add note' }));
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.getByRole('button', { name: 'Add note' })).toHaveFocus();
  get.mockResolvedValue({
    ...row,
    complaint_id: row.request_id,
    description: 'Other complaint',
  });
  await act(async () => {
    await router.navigate(`/dashboard/complaints/${row.request_id}`);
  });
  expect(await screen.findByText('Other complaint')).toBeVisible();
});
it('keeps successful-write feedback if the following read fails', async () => {
  get.mockResolvedValueOnce(row).mockRejectedValue(new Error('Read failure'));
  const { user } = mount(detail);
  await note(user);
  await user.click(screen.getByRole('button', { name: 'Confirm action' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(
    screen.getByText('Complaint action saved. Refreshing details and history.'),
  ).toBeVisible();
  expect(change).toHaveBeenCalledTimes(1);
});
