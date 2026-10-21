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
import ReportsPage from './ReportsPage';
import useAuth from '../../auth/hooks/useAuth';
import { exportReport, getReport, ReportError } from '../api/reports.api';
import type { ReportDownload } from '../api/reports.api';
import type { ReportKind, ReportPage } from '../reports.types';
import {
  reportFilters as filters,
  reportFixture as fixture,
  reportID as id,
  otherReportID as otherID,
  reportLeave as leave,
  reportComplaint as complaint,
} from '../../../test/fixtures/reports';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/reports.api', async (original) => ({
  ...(await original<typeof import('../api/reports.api')>()),
  getReport: vi.fn(),
  exportReport: vi.fn(),
}));
const verify = vi.fn(),
  signOut = vi.fn(),
  create = vi.fn(),
  revoke = vi.fn();
const account = {
  user_id: id,
  firebase_uid: 'uid',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
function auth(role: 'admin' | 'warden' | 'student' = 'admin', uid = 'uid') {
  vi.mocked(useAuth).mockReturnValue({
    account: { ...account, role, firebase_uid: uid },
    status: 'authenticated',
    message: '',
    verifiedPath: '/dashboard/reports',
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
  create.mockReturnValue('blob:private-report');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: create,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revoke,
  });
  vi.mocked(getReport).mockImplementation(async (kind, _filters, offset) =>
    fixture(kind, offset),
  );
  vi.mocked(exportReport).mockImplementation(
    async (_kind, _filters, format) => ({
      blob: new Blob([format === 'pdf' ? '%PDF-1.7' : 'PK']),
      format,
      filename: `hostelhive-report.${format}`,
    }),
  );
});
function open(kind: ReportKind = 'attendance') {
  const paths = {
    attendance: '/dashboard/reports',
    daily: '/dashboard/reports/daily',
    leaves: '/dashboard/reports/leaves',
    complaints: '/dashboard/reports/complaints',
  };
  const router = createMemoryRouter(
    (Object.keys(paths) as ReportKind[]).map((item) => ({
      path: paths[item],
      element: <ReportsPage kind={item} />,
    })),
    { initialEntries: [paths[kind]] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
function fill(from = filters.from, to = filters.to) {
  fireEvent.change(screen.getByLabelText('From date'), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: to } });
}
async function run() {
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  await screen.findByText(/Applied dates:/);
}
it.each(['admin', 'warden'] as const)(
  'lets %s select a report without guessing hostel dates or fetching data',
  (role) => {
    auth(role);
    open();
    expect(
      screen.getByText('Choose a date range and run a report.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Reports' })).toHaveFocus();
    expect(getReport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Download Excel' }),
    ).toBeDisabled();
  },
);
it.each(['attendance', 'daily', 'leaves', 'complaints'] as const)(
  'runs %s with applied dates, server totals and metadata',
  async (kind) => {
    open(kind);
    await run();
    expect(getReport).toHaveBeenLastCalledWith(
      kind,
      filters,
      0,
      'uid',
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Asia/Colombo', { exact: false })).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Report results' }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    if (kind === 'daily') {
      expect(
        screen.getByRole('rowheader', { name: '2026-10-19' }),
      ).toBeVisible();
      expect(screen.getByText(/Zero movements does not mean/)).toBeVisible();
    }
  },
);
it('exposes only filters supported by the selected report', async () => {
  open();
  expect(screen.getByLabelText('Direction')).toBeVisible();
  expect(screen.queryByLabelText('Status')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Complaints' }));
  expect(await screen.findByLabelText('Category')).toBeVisible();
  expect(screen.getByLabelText('Status')).toBeVisible();
  expect(screen.queryByLabelText('Direction')).toBeNull();
  expect(screen.getByLabelText('From date')).toHaveValue('');
  expect(getReport).not.toHaveBeenCalled();
});
it('normalizes and applies student/category/status filters and preserves invalid input', async () => {
  open('complaints');
  fill();
  fireEvent.change(screen.getByLabelText('Student profile ID (optional)'), {
    target: { value: 'bad' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  expect(screen.getByRole('alert')).toHaveTextContent('UUID');
  expect(getReport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Student profile ID (optional)')).toHaveValue(
    'bad',
  );
  fireEvent.change(screen.getByLabelText('Student profile ID (optional)'), {
    target: { value: ` ${id.toUpperCase()} ` },
  });
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'maintenance' },
  });
  fireEvent.change(screen.getByLabelText('Status'), {
    target: { value: 'pending' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  await screen.findByText(/Applied dates:/);
  expect(getReport).toHaveBeenLastCalledWith(
    'complaints',
    { ...filters, studentID: id, category: 'maintenance', status: 'pending' },
    0,
    'uid',
    expect.any(AbortSignal),
  );
});
it('explains invalid/oversized date ranges without clearing entered dates', () => {
  open();
  fill('2024-01-01', '2025-01-01');
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  expect(screen.getByRole('alert')).toHaveTextContent('366');
  expect(screen.getByLabelText('From date')).toHaveValue('2024-01-01');
  expect(getReport).not.toHaveBeenCalled();
});
it('paginates and refreshes the same applied filters from page 1', async () => {
  vi.mocked(getReport).mockImplementation(
    async (kind, _f, offset) =>
      ({
        ...fixture(kind, offset),
        total: 21,
        has_more: offset === 0,
      }) as ReportPage,
  );
  open();
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2')).toBeVisible();
  expect(getReport).toHaveBeenLastCalledWith(
    'attendance',
    filters,
    20,
    'uid',
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 1');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }));
  await screen.findByText('Page 1');
  expect(getReport).toHaveBeenLastCalledWith(
    'attendance',
    filters,
    0,
    'uid',
    expect.any(AbortSignal),
  );
});
it('shows empty results, failure and explicit retry without fabricating totals', async () => {
  vi.mocked(getReport)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      ...fixture(),
      kind: 'attendance',
      total: 0,
      summary: { entries: 0, exits: 0, distinct_students: 0 },
      items: [],
    });
  open();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be confirmed',
  );
  expect(screen.queryByText(/Applied dates:/)).toBeNull();
  expect(screen.getByLabelText('From date')).toHaveValue(filters.from);
  fireEvent.click(screen.getByRole('button', { name: 'Retry report' }));
  expect(
    await screen.findByText('No records match the applied filters.'),
  ).toBeVisible();
});
it.each(['PDF', 'Excel'] as const)(
  'prepares a private %s download using applied filters and releases its URL',
  async (label) => {
    const view = open();
    await run();
    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: `Download ${label}` }));
    const link = await screen.findByRole('link', {
      name: `Save ${label} report`,
    });
    expect(link).toHaveAttribute('href', 'blob:private-report');
    expect(link).toHaveAttribute(
      'download',
      `hostelhive-report.${label === 'PDF' ? 'pdf' : 'xlsx'}`,
    );
    expect(link).toHaveFocus();
    expect(exportReport).toHaveBeenLastCalledWith(
      'attendance',
      filters,
      label === 'PDF' ? 'pdf' : 'xlsx',
      'uid',
      expect.any(AbortSignal),
    );
    expect(create).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:private-report');
  },
);
it('blocks duplicate export clicks, allows cancellation and ignores a late file', async () => {
  let finish!: (file: ReportDownload) => void;
  vi.mocked(exportReport).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  open();
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(exportReport).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('From date')).toBeDisabled();
  const signal = vi.mocked(exportReport).mock.calls[0][4];
  fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }));
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('From date')).toBeEnabled();
  await act(async () =>
    finish({ blob: new Blob(['%PDF-']), format: 'pdf', filename: 'old.pdf' }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Save PDF report' })).toBeNull();
});
it.each(['busy', 'unavailable'] as const)(
  'preserves a report and retries %s export failures explicitly',
  async (kind) => {
    vi.mocked(exportReport).mockRejectedValueOnce(
      new ReportError(kind, 'Try export again'),
    );
    open();
    await run();
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Try export again',
    );
    expect(screen.getByRole('table')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Excel export' }));
    expect(
      await screen.findByRole('link', { name: 'Save Excel report' }),
    ).toBeVisible();
    expect(exportReport).toHaveBeenCalledTimes(2);
  },
);
it('explains oversized exports and does not blindly retry them', async () => {
  vi.mocked(exportReport).mockRejectedValue(
    new ReportError('too-large', 'Narrow filters'),
  );
  open();
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Narrow filters');
  expect(screen.queryByRole('button', { name: 'Retry PDF export' })).toBeNull();
  expect(screen.getByRole('table')).toBeVisible();
});
it('revokes old downloads when applied filters change, refresh, or clear', async () => {
  open();
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByRole('link', { name: 'Save PDF report' });
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  await screen.findByText(/Applied dates:/);
  expect(revoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByRole('link', { name: 'Save PDF report' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }));
  await screen.findByText(/Applied dates:/);
  expect(revoke).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(
    screen.getByText('Choose a date range and run a report.'),
  ).toBeVisible();
  expect(screen.getByLabelText('From date')).toHaveValue('');
});
it('discards pending exports when switching reports', async () => {
  vi.mocked(exportReport).mockImplementationOnce(() => new Promise(() => {}));
  open();
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  const signal = vi.mocked(exportReport).mock.calls[0][4];
  fireEvent.click(screen.getByRole('link', { name: 'Daily attendance' }));
  expect(
    await screen.findByText('Choose a date range and run a report.'),
  ).toBeVisible();
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText('Preparing private report download…')).toBeNull();
});
it.each(['session', 'forbidden'] as const)(
  'clears private report data and download URLs after %s',
  async (kind) => {
    open();
    await run();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await screen.findByRole('link', { name: 'Save PDF report' });
    vi.mocked(exportReport).mockRejectedValue(
      new ReportError(kind, 'Access rejected'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access rejected',
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Save PDF report' })).toBeNull();
    expect(revoke).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify account access' }),
    );
    expect(
      await screen.findByText('Choose a date range and run a report.'),
    ).toBeVisible();
  },
);
it('handles access rejection from a report read', async () => {
  vi.mocked(getReport).mockRejectedValue(
    new ReportError('forbidden', 'No report access'),
  );
  open();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No report access',
  );
  expect(screen.queryByRole('button', { name: 'Retry report' })).toBeNull();
});
it('aborts old-account reads and exports and never renders their late results', async () => {
  let finish!: (page: ReportPage) => void;
  vi.mocked(getReport).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  const signal = vi.mocked(getReport).mock.calls[0][4];
  auth('warden', 'other');
  view.rerender(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => finish(fixture()));
  expect(screen.queryByRole('table')).toBeNull();
  expect(
    screen.getByText('Choose a date range and run a report.'),
  ).toBeVisible();
});
it('renders cancellation and resolution records without adding mutation controls', async () => {
  const cancelled = {
    ...leave,
    status: 'cancelled' as const,
    cancelled_at: leave.created_at,
    cancelled_by: otherID,
  };
  vi.mocked(getReport).mockResolvedValue({
    ...fixture('leaves'),
    kind: 'leaves',
    items: [cancelled],
    summary: { pending: 0, approved: 0, rejected: 0, cancelled: 1 },
  });
  const view = open('leaves');
  await run();
  fireEvent.click(screen.getByText('Decision / cancellation details'));
  expect(screen.getByText('Cancelled at')).toBeVisible();
  expect(screen.queryByRole('link', { name: id })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /approve|reject|cancel request/i }),
  ).toBeNull();
  view.unmount();
  vi.mocked(getReport).mockResolvedValue({
    ...fixture('complaints'),
    kind: 'complaints',
    items: [
      {
        ...complaint,
        status: 'resolved',
        resolution: {
          update_id: otherID,
          resolved_at: complaint.updated_at,
          resolved_by: otherID,
          note: 'Repaired',
        },
      },
    ],
    summary: {
      by_status: { pending: 0, in_progress: 0, resolved: 1 },
      by_category: { maintenance: 1, disciplinary: 0 },
    },
  });
  open('complaints');
  await run();
  fireEvent.click(screen.getByText('Resolution details'));
  expect(screen.getByText('Repaired')).toBeVisible();
});
it('renders escaped descriptions and missing legacy resolution data', async () => {
  vi.mocked(getReport).mockResolvedValue({
    ...fixture('complaints'),
    kind: 'complaints',
    items: [{ ...complaint, description: '<img src=x onerror=alert(1)>' }],
    summary: {
      by_status: { pending: 1, in_progress: 0, resolved: 0 },
      by_category: { maintenance: 1, disciplinary: 0 },
    },
  });
  open('complaints');
  await run();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(document.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByText('Resolution details'));
  expect(screen.getByText(/No recorded resolution/)).toBeVisible();
});
it('displays validated movement references and safe source links', async () => {
  vi.mocked(getReport).mockResolvedValue({
    ...fixture(),
    kind: 'attendance',
    summary: { entries: 1, exits: 0, distinct_students: 1 },
    items: [
      {
        event_id: id,
        device_id: otherID,
        student_id: id,
        direction: 'IN',
        occurred_at: '2026-10-20T08:00:00Z',
        access_result: 'approved',
        late_access_id: otherID,
        incident_id: id,
      },
    ],
  });
  open();
  await run();
  fireEvent.click(screen.getByText('Movement references'));
  const table = screen.getByRole('table');
  expect(
    within(table)
      .getAllByRole('link', { name: id })
      .map((a) => a.getAttribute('href')),
  ).toContain(`/dashboard/attendance/incidents/${id}`);
});
it('labels a timezone fallback instead of silently presenting device time as hostel time', async () => {
  vi.mocked(getReport).mockResolvedValue({
    ...fixture(),
    kind: 'attendance',
    timezone: 'Local',
    summary: { entries: 1, exits: 0, distinct_students: 1 },
    items:
      fixture().kind === 'attendance'
        ? [
            {
              event_id: id,
              device_id: otherID,
              student_id: id,
              direction: 'IN',
              occurred_at: '2026-10-20T08:00:00Z',
            },
          ]
        : [],
  });
  open();
  await run();
  expect(
    screen.getByText(/device time; stored timezone unavailable/),
  ).toBeVisible();
});
it('denies student and signed-out access before reading reports', () => {
  auth('student');
  const view = render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Admin or Warden');
  const value = vi.mocked(useAuth)();
  vi.mocked(useAuth).mockReturnValue({ ...value, account: null });
  view.rerender(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  expect(getReport).not.toHaveBeenCalled();
});
it('revokes a prepared download immediately on account change', async () => {
  const view = render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByRole('link', { name: 'Save PDF report' });
  auth('warden', 'different');
  view.rerender(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  expect(revoke).toHaveBeenCalledWith('blob:private-report');
  expect(screen.queryByRole('link', { name: 'Save PDF report' })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});
it('aborts old-account export responses before any private URL is created', async () => {
  let finish!: (file: ReportDownload) => void;
  vi.mocked(exportReport).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  await run();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  const signal = vi.mocked(exportReport).mock.calls[0][4];
  auth('warden', 'different');
  view.rerender(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({ blob: new Blob(['%PDF-']), filename: 'old.pdf', format: 'pdf' }),
  );
  expect(create).not.toHaveBeenCalled();
});
