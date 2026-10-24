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
import AnnouncementList from './AnnouncementList';
import AnnouncementDetail from './AnnouncementDetail';
import AnnouncementForm from './AnnouncementForm';
import AnnouncementsPage from '../pages/AnnouncementsPage';
import {
  AnnouncementError,
  getAnnouncement,
  getAnnouncementSummary,
  listAnnouncements,
  publishAnnouncement,
} from '../api/announcements.api';
import {
  announcementFixture as row,
  announcementPage,
  summaryFixture,
} from '../../../test/fixtures/announcements';
import useAuth from '../../auth/hooks/useAuth';
vi.mock('../api/announcements.api', async (original) => ({
  ...(await original<typeof import('../api/announcements.api')>()),
  getAnnouncement: vi.fn(),
  getAnnouncementSummary: vi.fn(),
  listAnnouncements: vi.fn(),
  publishAnnouncement: vi.fn(),
}));
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
const denied = vi.fn();
const verify = vi.fn();
const signOut = vi.fn();
const account = {
  user_id: row.published_by,
  firebase_uid: 'staff',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listAnnouncements).mockResolvedValue(announcementPage());
  vi.mocked(getAnnouncement).mockResolvedValue(row);
  vi.mocked(getAnnouncementSummary).mockResolvedValue(summaryFixture);
  vi.mocked(publishAnnouncement).mockResolvedValue({
    announcement: row,
    replayed: false,
  });
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    account,
    status: 'authenticated',
    message: '',
    verifiedPath: '/dashboard/announcements',
    busy: false,
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
});
function open(mode: 'list' | 'detail' | 'new' = 'list', staff = true) {
  const basePath = staff
    ? '/dashboard/announcements'
    : '/student/announcements';
  const props = {
    uid: staff ? 'staff' : 'student',
    basePath,
    staff,
    onAccessError: denied,
  };
  const router = createMemoryRouter(
    [
      { path: basePath, element: <AnnouncementList {...props} /> },
      {
        path: `${basePath}/new`,
        element: <AnnouncementForm {...props} userID={row.published_by} />,
      },
      {
        path: `${basePath}/:announcementID`,
        element: <AnnouncementDetail {...props} />,
      },
    ],
    {
      initialEntries: [
        mode === 'new'
          ? `${basePath}/new`
          : mode === 'detail'
            ? `${basePath}/${row.announcement_id}`
            : basePath,
      ],
    },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
function fill() {
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: ` ${row.title} ` },
  });
  fireEvent.change(screen.getByLabelText('Content'), {
    target: { value: ` ${row.content} ` },
  });
}
it('shows a student feed with details links and no publication action', async () => {
  open('list', false);
  expect(await screen.findByRole('link', { name: row.title })).toHaveAttribute(
    'href',
    `/student/announcements/${row.announcement_id}`,
  );
  expect(
    screen.queryByRole('link', { name: 'New announcement' }),
  ).not.toBeInTheDocument();
  expect(getAnnouncementSummary).not.toHaveBeenCalled();
});
it('shows the staff publication link', async () => {
  open();
  await screen.findByRole('link', { name: row.title });
  expect(
    screen.getByRole('link', { name: 'New announcement' }),
  ).toHaveAttribute('href', '/dashboard/announcements/new');
});
it('paginates and refreshes the latest page without duplicate pending requests', async () => {
  vi.mocked(listAnnouncements)
    .mockResolvedValueOnce(announcementPage([row], 0, 21))
    .mockResolvedValueOnce(announcementPage([row], 20, 21))
    .mockResolvedValue(announcementPage([row], 0, 21));
  open();
  await screen.findByRole('link', { name: row.title });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2')).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh announcements' }),
  );
  expect(await screen.findByText('Page 1')).toBeVisible();
  expect(listAnnouncements).toHaveBeenLastCalledWith(
    'staff',
    expect.any(AbortSignal),
    0,
  );
});
it('handles an empty feed and unavailable responses with retry', async () => {
  vi.mocked(listAnnouncements)
    .mockRejectedValueOnce(new AnnouncementError('unavailable', 'Offline'))
    .mockResolvedValueOnce(announcementPage([]));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry announcements' }),
  );
  expect(
    await screen.findByText('No announcements have been published yet.'),
  ).toBeVisible();
});
it('renders source content as escaped text and keeps delivery data staff-only', async () => {
  vi.mocked(getAnnouncement).mockResolvedValue({
    ...row,
    content: '<script>unsafe()</script>\nText',
  });
  open('detail', false);
  expect(await screen.findByText(/<script>unsafe/)).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(
    screen.queryByRole('heading', { name: 'Delivery summary' }),
  ).not.toBeInTheDocument();
  expect(getAnnouncementSummary).not.toHaveBeenCalled();
});
it('shows backend delivery counts with clear eventual-delivery wording', async () => {
  open('detail');
  expect(await screen.findByText('Original recipients')).toBeVisible();
  expect(screen.getByText('10')).toBeVisible();
  expect(screen.getByText('Delivered to inbox')).toBeVisible();
  expect(screen.getByText(/Inbox delivery may lag publication/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Delete|Edit announcement|Schedule/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh delivery summary' }),
  );
  await waitFor(() => expect(getAnnouncementSummary).toHaveBeenCalledTimes(2));
});
it('keeps published content visible when summary fetching fails', async () => {
  vi.mocked(getAnnouncementSummary)
    .mockRejectedValueOnce(
      new AnnouncementError('unavailable', 'Counts unavailable'),
    )
    .mockResolvedValueOnce(summaryFixture);
  open('detail');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Counts unavailable',
  );
  expect(screen.getByRole('heading', { name: row.title })).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry announcements' }),
  );
  expect(await screen.findByText('Original recipients')).toBeVisible();
});
it('handles missing details and retries without exposing stale content', async () => {
  vi.mocked(getAnnouncement)
    .mockRejectedValueOnce(new AnnouncementError('not-found', 'Not available'))
    .mockResolvedValueOnce(row);
  open('detail');
  expect(await screen.findByRole('alert')).toHaveTextContent('Not available');
  expect(getAnnouncementSummary).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry announcements' }),
  );
  expect(await screen.findByRole('heading', { name: row.title })).toBeVisible();
});
it('validates fields before preparing a publication', async () => {
  open('new');
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('single-line title');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: row.title },
  });
  fireEvent.change(screen.getByLabelText('Content'), {
    target: { value: '🙂'.repeat(5001) },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('5000');
  expect(publishAnnouncement).not.toHaveBeenCalled();
});
it('requires review and explicit confirmation before publishing', async () => {
  const { router } = open('new');
  fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  expect(
    screen.getByRole('region', { name: 'Review announcement' }),
  ).toBeVisible();
  expect(publishAnnouncement).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Publish to all students' }),
  );
  // The review preview has the same title in an h4. Wait for the published
  // detail route and its h2 rather than accepting the transient draft heading.
  await waitFor(() => {
    expect(router.state.location.pathname).toBe(
      `/dashboard/announcements/${row.announcement_id}`,
    );
    expect(
      screen.getByRole('heading', { name: row.title, level: 2 }),
    ).toBeVisible();
  });
  expect(publishAnnouncement).toHaveBeenCalledWith(
    {
      request_id: expect.any(String),
      title: row.title,
      content: row.content,
      audience: 'all_students',
    },
    'staff',
    row.published_by,
    expect.any(AbortSignal),
  );
  expect(
    screen.getByText(
      'Announcement published. Inbox delivery is processed in the background.',
    ),
  ).toBeVisible();
});
it('supports editing a reviewed draft before publication', async () => {
  open('new');
  fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  expect(screen.getByLabelText('Title')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  expect(screen.getByLabelText('Title')).toBeEnabled();
  expect(screen.getByLabelText('Content')).toHaveValue(` ${row.content} `);
});
it('prevents duplicate clicks while a publication is pending', async () => {
  vi.mocked(publishAnnouncement).mockReturnValue(new Promise(() => {}));
  open('new');
  fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  const button = screen.getByRole('button', {
    name: 'Publish to all students',
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(publishAnnouncement).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
  expect(
    screen.getByRole('heading', { name: row.title, level: 4 }),
  ).toBeVisible();
});
it('locks unknown outcomes and retries the same normalized publication and UUID', async () => {
  vi.mocked(publishAnnouncement)
    .mockRejectedValueOnce(new AnnouncementError('unavailable', 'Offline'))
    .mockResolvedValueOnce({ announcement: row, replayed: true });
  open('new');
  fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Publish to all students' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Retry identical publication' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Content')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Edit draft' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry identical publication' }),
  );
  await screen.findByRole('heading', { name: row.title, level: 2 });
  const calls = vi.mocked(publishAnnouncement).mock.calls;
  expect(calls[1].slice(0, 3)).toEqual(calls[0].slice(0, 3));
});
it.each(['invalid', 'conflict'] as const)(
  'preserves text after confirmed %s rejection',
  async (kind) => {
    vi.mocked(publishAnnouncement).mockRejectedValueOnce(
      new AnnouncementError(kind, 'Review input and existing announcements'),
    );
    open('new');
    fill();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review announcement' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Publish to all students' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Review input');
    expect(screen.getByLabelText('Title')).toHaveValue(` ${row.title} `);
    expect(screen.getByLabelText('Title')).toBeEnabled();
  },
);
it('warns before discarding a draft and supports staying or leaving', async () => {
  const { router } = open('new');
  fill();
  await userEvent.click(
    screen.getByRole('link', { name: 'View announcements' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Discard this announcement draft',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(screen.getByLabelText('Title')).toHaveValue(` ${row.title} `);
  await userEvent.click(
    screen.getByRole('link', { name: 'View announcements' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and leave' }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/dashboard/announcements'),
  );
});
it.each(['session', 'setup', 'forbidden'] as const)(
  'propagates %s from reads',
  async (kind) => {
    vi.mocked(listAnnouncements).mockRejectedValue(
      new AnnouncementError(kind, 'Verify account'),
    );
    open('list', false);
    await waitFor(() =>
      expect(denied).toHaveBeenCalledWith(expect.objectContaining({ kind })),
    );
    expect(
      screen.queryByRole('link', { name: row.title }),
    ).not.toBeInTheDocument();
  },
);
it('propagates access denial from publication without keeping the write active', async () => {
  vi.mocked(publishAnnouncement).mockRejectedValue(
    new AnnouncementError('forbidden', 'Denied'),
  );
  open('new');
  fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review announcement' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Publish to all students' }),
  );
  await waitFor(() => expect(denied).toHaveBeenCalled());
});
it('aborts list calls and ignores late responses after unmount', async () => {
  let finish!: (value: ReturnType<typeof announcementPage>) => void;
  vi.mocked(listAnnouncements).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = open();
  const signal = vi.mocked(listAnnouncements).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(announcementPage()));
  expect(
    screen.queryByRole('link', { name: row.title }),
  ).not.toBeInTheDocument();
});
it('clears staff private content on access loss and offers verification', async () => {
  vi.mocked(listAnnouncements).mockRejectedValueOnce(
    new AnnouncementError('forbidden', 'Access revoked'),
  );
  const router = createMemoryRouter([
    { path: '/', element: <AnnouncementsPage /> },
  ]);
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked');
  await userEvent.click(
    screen.getByRole('button', { name: 'Verify account access' }),
  );
  expect(await screen.findByRole('link', { name: row.title })).toBeVisible();
  expect(verify).toHaveBeenCalled();
});
it('does not render staff management for a student account', () => {
  vi.mocked(useAuth).mockReturnValue({
    account: { ...account, role: 'student' },
    status: 'authenticated',
    message: '',
    verifiedPath: '/',
    busy: false,
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
  const router = createMemoryRouter([
    { path: '/', element: <AnnouncementsPage view="new" /> },
  ]);
  render(<RouterProvider router={router} />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Staff access is required',
  );
  expect(listAnnouncements).not.toHaveBeenCalled();
});
