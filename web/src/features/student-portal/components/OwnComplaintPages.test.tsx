import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OwnComplaintList from './OwnComplaintList';
import OwnComplaintForm from './OwnComplaintForm';
import OwnComplaintDetail from './OwnComplaintDetail';
import {
  addOwnComplaintNote,
  getOwnComplaint,
  getOwnComplaintHistory,
  listOwnComplaints,
  OwnComplaintError,
  submitOwnComplaint,
} from '../api/own-complaints.api';
import {
  complaintFixture as row,
  complaintPage,
  createdUpdate,
  noteUpdate,
} from '../../../test/fixtures/complaints';
vi.mock('../api/own-complaints.api', async (original) => ({
  ...(await original<typeof import('../api/own-complaints.api')>()),
  listOwnComplaints: vi.fn(),
  getOwnComplaint: vi.fn(),
  getOwnComplaintHistory: vi.fn(),
  submitOwnComplaint: vi.fn(),
  addOwnComplaintNote: vi.fn(),
}));
const props = {
  uid: 'student',
  studentID: row.student_id,
  onAccessError: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOwnComplaints).mockResolvedValue(complaintPage([row]));
  vi.mocked(getOwnComplaint).mockResolvedValue(row);
  vi.mocked(getOwnComplaintHistory).mockResolvedValue(
    complaintPage([createdUpdate]),
  );
  vi.mocked(submitOwnComplaint).mockResolvedValue(row);
  vi.mocked(addOwnComplaintNote).mockResolvedValue(noteUpdate);
});
function open(mode: 'list' | 'new' | 'detail' = 'list') {
  const router = createMemoryRouter(
    [
      { path: '/student/complaints', element: <OwnComplaintList {...props} /> },
      {
        path: '/student/complaints/new',
        element: <OwnComplaintForm {...props} />,
      },
      {
        path: '/student/complaints/:complaintID',
        element: <OwnComplaintDetail {...props} />,
      },
    ],
    {
      initialEntries: [
        mode === 'new'
          ? '/student/complaints/new'
          : mode === 'detail'
            ? `/student/complaints/${row.complaint_id}`
            : '/student/complaints',
      ],
    },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
it('shows owned complaints, categories, details link and no staff mutation controls', async () => {
  open();
  expect(await screen.findByText(row.description)).toBeVisible();
  expect(screen.getByRole('link', { name: /View complaint/ })).toHaveAttribute(
    'href',
    `/student/complaints/${row.complaint_id}`,
  );
  expect(
    screen.queryByRole('button', { name: /Change status|Reopen|Archive/ }),
  ).not.toBeInTheDocument();
});
it('changes status/category filters and resets pagination on refresh', async () => {
  open();
  await screen.findByText(row.description);
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'disciplinary' },
  });
  await waitFor(() =>
    expect(listOwnComplaints).toHaveBeenLastCalledWith(
      'student',
      row.student_id,
      expect.any(AbortSignal),
      '',
      'disciplinary',
      0,
    ),
  );
  await waitFor(() => expect(screen.getByLabelText('Status')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Status'), {
    target: { value: 'resolved' },
  });
  await waitFor(() =>
    expect(listOwnComplaints).toHaveBeenLastCalledWith(
      'student',
      row.student_id,
      expect.any(AbortSignal),
      'resolved',
      'disciplinary',
      0,
    ),
  );
});
it('paginates without repeated requests and refreshes to page one', async () => {
  vi.mocked(listOwnComplaints)
    .mockResolvedValueOnce(complaintPage([row], 0, 21))
    .mockResolvedValueOnce(complaintPage([row], 20, 21))
    .mockResolvedValue(complaintPage([row], 0, 21));
  open();
  await screen.findByText(row.description);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2')).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh complaints' }),
  );
  expect(await screen.findByText('Page 1')).toBeVisible();
});
it('shows empty results and retries failed lists', async () => {
  vi.mocked(listOwnComplaints)
    .mockRejectedValueOnce(new OwnComplaintError('unavailable', 'Offline'))
    .mockResolvedValueOnce(complaintPage([]));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry complaints' }),
  );
  expect(
    await screen.findByText('No complaints match these filters.'),
  ).toBeVisible();
});
it('does not display old-account results after props switch', async () => {
  let complete!: (value: ReturnType<typeof complaintPage<typeof row>>) => void;
  vi.mocked(listOwnComplaints)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    )
    .mockResolvedValueOnce(complaintPage([]));
  const router = createMemoryRouter([
    { path: '/', element: <OwnComplaintList {...props} /> },
  ]);
  const view = render(<RouterProvider router={router} />);
  view.unmount();
  const next = createMemoryRouter([
    { path: '/', element: <OwnComplaintList {...props} uid="next-student" /> },
  ]);
  render(<RouterProvider router={next} />);
  await screen.findByText('No complaints match these filters.');
  await act(async () => complete(complaintPage([row])));
  expect(screen.queryByText(row.description)).not.toBeInTheDocument();
});
it('validates required and Unicode-length text before submission', async () => {
  open('new');
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit complaint' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a description or note.',
  );
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: '🙂'.repeat(2001) },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit complaint' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('2000 characters');
  expect(submitOwnComplaint).not.toHaveBeenCalled();
});
it('submits normalized supported data and navigates to details', async () => {
  open('new');
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: ` ${row.description} ` },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit complaint' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Complaint details' }),
  ).toBeVisible();
  expect(submitOwnComplaint).toHaveBeenCalledWith(
    {
      request_id: expect.any(String),
      category: 'maintenance',
      description: row.description,
    },
    'student',
    row.student_id,
    expect.any(AbortSignal),
  );
  expect(screen.getByText('Complaint submitted successfully.')).toBeVisible();
});
it('prevents duplicate submissions and locks the exact payload after an uncertain result', async () => {
  vi.mocked(submitOwnComplaint)
    .mockRejectedValueOnce(new OwnComplaintError('unavailable', 'Offline'))
    .mockResolvedValueOnce(row);
  open('new');
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: row.description },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit complaint' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Retry identical action' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Description')).toBeDisabled();
  expect(screen.getByLabelText('Category')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry identical action' }),
  );
  await screen.findByRole('heading', { name: 'Complaint details' });
  expect(vi.mocked(submitOwnComplaint).mock.calls[1][0]).toEqual(
    vi.mocked(submitOwnComplaint).mock.calls[0][0],
  );
});
it('preserves a rejected creation draft and permits correction', async () => {
  vi.mocked(submitOwnComplaint).mockRejectedValueOnce(
    new OwnComplaintError('invalid', 'Check input'),
  );
  open('new');
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: row.description },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit complaint' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Check input');
  expect(screen.getByLabelText('Description')).toHaveValue(row.description);
  expect(screen.getByLabelText('Description')).toBeEnabled();
});
it('warns before discarding a draft and supports staying or leaving', async () => {
  const { router } = open('new');
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Unsaved' },
  });
  await userEvent.click(
    screen.getByRole('link', { name: 'View my complaints' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Discard this complaint draft',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(screen.getByLabelText('Description')).toHaveValue('Unsaved');
  await userEvent.click(
    screen.getByRole('link', { name: 'View my complaints' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and leave' }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/student/complaints'),
  );
});
it('shows staff response history as escaped text with no internal actor fields', async () => {
  vi.mocked(getOwnComplaintHistory).mockResolvedValue(
    complaintPage([
      createdUpdate,
      { ...noteUpdate, text: '<script>unsafe()</script>' },
    ]),
  );
  open('detail');
  expect(await screen.findByText('<script>unsafe()</script>')).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.queryByText(noteUpdate.actor_id)).not.toBeInTheDocument();
});
it('hides new notes on resolved complaints and never offers status changes', async () => {
  vi.mocked(getOwnComplaint).mockResolvedValue({ ...row, status: 'resolved' });
  open('detail');
  await screen.findByText('Resolved');
  expect(
    screen.queryByRole('button', { name: 'Add note' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Change status|Reopen/ }),
  ).not.toBeInTheDocument();
});
it('adds a note and refetches details and history', async () => {
  open('detail');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add note' }),
  );
  fireEvent.change(screen.getByLabelText('Note'), {
    target: { value: ' Please repair soon ' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Submit note' }));
  await waitFor(() => expect(getOwnComplaint).toHaveBeenCalledTimes(2));
  expect(addOwnComplaintNote).toHaveBeenCalledWith(
    row,
    {
      request_id: expect.any(String),
      expected_version: 1,
      text: 'Please repair soon',
    },
    'student',
    row.student_id,
    expect.any(AbortSignal),
  );
  expect(await screen.findByRole('button', { name: 'Add note' })).toBeVisible();
});
it('requires an explicit reload and review after a note conflict while preserving text', async () => {
  vi.mocked(addOwnComplaintNote)
    .mockRejectedValueOnce(new OwnComplaintError('conflict', 'Changed'))
    .mockResolvedValueOnce(noteUpdate);
  open('detail');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add note' }),
  );
  fireEvent.change(screen.getByLabelText('Note'), {
    target: { value: 'Keep this note' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Submit note' }));
  expect(
    await screen.findByRole('button', { name: 'Reload complaint and history' }),
  ).toBeVisible();
  vi.mocked(getOwnComplaint).mockResolvedValue({
    ...row,
    status: 'in_progress',
    version: 2,
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload complaint and history' }),
  );
  expect(await screen.findByText(/Reloaded version 2/)).toBeVisible();
  expect(screen.getByLabelText('Note')).toHaveValue('Keep this note');
  expect(addOwnComplaintNote).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Submit note' }));
  await waitFor(() => expect(addOwnComplaintNote).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(addOwnComplaintNote).mock.calls;
  expect(calls[1][1].expected_version).toBe(2);
  expect(calls[1][1].request_id).not.toBe(calls[0][1].request_id);
});
it('retries an uncertain note with the original version and UUID', async () => {
  vi.mocked(addOwnComplaintNote)
    .mockRejectedValueOnce(new OwnComplaintError('unavailable', 'Offline'))
    .mockResolvedValueOnce(noteUpdate);
  open('detail');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add note' }),
  );
  fireEvent.change(screen.getByLabelText('Note'), {
    target: { value: 'Retry note' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Submit note' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry identical action' }),
  );
  await waitFor(() => expect(addOwnComplaintNote).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(addOwnComplaintNote).mock.calls;
  expect(calls[1].slice(0, 4)).toEqual(calls[0].slice(0, 4));
});
it.each(['session', 'setup', 'forbidden'] as const)(
  'invalidates the portal on %s',
  async (kind) => {
    vi.mocked(listOwnComplaints).mockRejectedValue(
      new OwnComplaintError(kind, 'Verify account'),
    );
    open();
    await waitFor(() =>
      expect(props.onAccessError).toHaveBeenCalledWith(
        expect.objectContaining({ kind }),
      ),
    );
    expect(screen.queryByText(row.description)).not.toBeInTheDocument();
  },
);
it('does not fetch history or show data for missing detail', async () => {
  vi.mocked(getOwnComplaint).mockRejectedValue(
    new OwnComplaintError('not-found', 'Unavailable'),
  );
  open('detail');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  expect(getOwnComplaintHistory).not.toHaveBeenCalled();
});
