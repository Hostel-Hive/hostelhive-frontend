import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
  logout,
} from '../../auth/api/auth.api';
import { listStudents, StudentRequestError } from '../api/students.api';
import {
  getStudentImportTemplate,
  importStudents,
} from '../api/student-import.api';
import { parseStudentCSV, readStudentCSV } from '../student-import';
import {
  csvRow,
  makeCSV,
  importReportFixture,
} from '../../../test/fixtures/student-import';
import { studentPageFixture } from '../../../test/fixtures/student';

vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  listStudents: vi.fn(),
}));
vi.mock('../api/student-import.api', () => ({
  getStudentImportTemplate: vi.fn(),
  importStudents: vi.fn(),
}));
vi.mock('../student-import', async (original) => ({
  ...(await original<typeof import('../student-import')>()),
  readStudentCSV: vi.fn(),
}));
const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
const NativeURL = URL;
const revokeURL = vi.fn();
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (originalShow)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShow,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:csv-download');
      static revokeObjectURL = revokeURL;
    },
  );
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'admin',
    firebase_uid: 'admin-uid',
    email: 'admin@example.com',
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
  vi.mocked(logout).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
  });
  vi.mocked(listStudents).mockResolvedValue(studentPageFixture);
  vi.mocked(getStudentImportTemplate).mockResolvedValue(
    new Blob(['header'], { type: 'text/csv' }),
  );
  vi.mocked(importStudents).mockResolvedValue(importReportFixture);
  vi.mocked(readStudentCSV).mockImplementation(async (file) => ({
    file,
    records: parseStudentCSV(makeCSV([csvRow, csvRow, csvRow])),
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open(path = '/dashboard/students/import?faculty=Science') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
async function choose() {
  fireEvent.change(await screen.findByLabelText('Choose student CSV'), {
    target: {
      files: [
        new File([makeCSV([csvRow, csvRow, csvRow])], 'students.csv', {
          type: 'text/csv',
        }),
      ],
    },
  });
  await screen.findByRole('heading', { name: '2. Review 3 records' });
}
async function confirm() {
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I understand that valid rows/ }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Import 3 records' }),
  );
}
it('hides imports from Warden navigation and denies direct import URLs without fetching', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden',
    firebase_uid: 'warden-uid',
    email: 'warden@example.com',
    role: 'warden',
    is_active: true,
  });
  const view = open('/dashboard/students');
  await screen.findByRole('heading', { name: 'Students' });
  expect(
    screen.queryByRole('link', { name: 'Import CSV' }),
  ).not.toBeInTheDocument();
  view.unmount();
  open();
  await waitFor(() =>
    expect(window.location.pathname).toBe('/dashboard/warden'),
  );
  expect(importStudents).not.toHaveBeenCalled();
  expect(getStudentImportTemplate).not.toHaveBeenCalled();
  expect(readStudentCSV).not.toHaveBeenCalled();
});
it('redirects signed-out users before importing or downloading', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  open();
  await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
  expect(importStudents).not.toHaveBeenCalled();
  expect(getStudentImportTemplate).not.toHaveBeenCalled();
});
it('links Admin import from the directory and preserves filters', async () => {
  open('/dashboard/students?faculty=Science&offset=20');
  await screen.findByRole('heading', { name: 'Students' });
  expect(screen.getByRole('link', { name: 'Import CSV' })).toHaveAttribute(
    'href',
    '/dashboard/students/import?faculty=Science&offset=20',
  );
});
it('downloads the server template privately and releases its Blob URL on unmount', async () => {
  const view = open();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Get CSV template' }),
  );
  const link = await screen.findByRole('link', { name: 'Save CSV template' });
  expect(link).toHaveAttribute('href', 'blob:csv-download');
  expect(link).toHaveAttribute('download', 'student-import-template.csv');
  expect(getStudentImportTemplate).toHaveBeenCalledWith(
    'admin-uid',
    expect.any(AbortSignal),
  );
  view.unmount();
  expect(revokeURL).toHaveBeenCalledWith('blob:csv-download');
});
it('requires file review and explicit confirmation before sending, then shows every row result', async () => {
  open();
  await choose();
  expect(
    screen.getByRole('heading', { name: '2. Review 3 records' }),
  ).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Import 3 records' }),
  ).toBeDisabled();
  expect(importStudents).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'CSV preview' })).toHaveTextContent(
    'Alex Morgan',
  );
  await confirm();
  expect(
    await screen.findByRole('heading', { name: 'Import report' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('1 created · 1 rejected · 1 not attempted · 3 total'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Import results' }),
  ).toHaveTextContent('Not attempted');
  expect(
    screen.getByRole('link', { name: 'Download report CSV' }),
  ).toHaveAttribute('download', 'student-import-report.csv');
  expect(
    screen.queryByRole('region', { name: 'CSV preview' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('link', { name: 'View refreshed student directory' }),
  );
  await screen.findByRole('heading', { name: 'Students' });
  expect(listStudents).toHaveBeenCalled();
  expect(window.location.search).toBe('?faculty=Science');
});
it('shows local structural errors without submitting and supports clearing a valid selection', async () => {
  vi.mocked(readStudentCSV).mockRejectedValueOnce(
    new Error('Use the template headers exactly once.'),
  );
  open();
  fireEvent.change(await screen.findByLabelText('Choose student CSV'), {
    target: { files: [new File(['bad'], 'bad.csv')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'template headers',
  );
  expect(importStudents).not.toHaveBeenCalled();
  await choose();
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear selected CSV' }),
  );
  expect(
    screen.queryByRole('region', { name: 'CSV preview' }),
  ).not.toBeInTheDocument();
});
it('prevents duplicate submissions and warns on reload while a request is pending', async () => {
  let finish!: (report: typeof importReportFixture) => void;
  vi.mocked(importStudents).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  open();
  await choose();
  await userEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
  const button = screen.getByRole('button', { name: 'Import 3 records' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(importStudents).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(async () => finish(importReportFixture));
  await screen.findByRole('heading', { name: 'Import report' });
});
it('requires a directory check after a lost response, then allows a newly reviewed CSV', async () => {
  vi.mocked(importStudents).mockRejectedValue(new Error('lost response'));
  open();
  await choose();
  await confirm();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'outcome could not be confirmed',
  );
  expect(
    screen.getByRole('button', { name: 'Import 3 records' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Choose student CSV')).toBeDisabled();
  expect(
    screen.getByRole('link', { name: 'Open student directory in a new tab' }),
  ).toHaveAttribute('target', '_blank');
  expect(
    screen.getByRole('link', { name: 'Open student directory in a new tab' }),
  ).toHaveAttribute('href', '/dashboard/students');
  const prepare = screen.getByRole('button', { name: 'Prepare another CSV' });
  expect(prepare).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I checked the directory/ }),
  );
  await userEvent.click(prepare);
  expect(
    screen.queryByRole('region', { name: 'CSV preview' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Choose student CSV')).toBeEnabled();
  expect(importStudents).toHaveBeenCalledOnce();
});
it('rejects a mismatched report as uncertain instead of claiming results for another CSV', async () => {
  vi.mocked(importStudents).mockResolvedValue({
    total: 1,
    created: 1,
    rejected: 0,
    not_attempted: 0,
    rows: [importReportFixture.rows[0]],
  });
  open();
  await choose();
  await confirm();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'outcome could not be confirmed',
  );
  expect(
    screen.queryByRole('heading', { name: 'Import report' }),
  ).not.toBeInTheDocument();
});
it('allows selecting a corrected file after a structural server rejection', async () => {
  vi.mocked(importStudents).mockRejectedValue(
    new StudentRequestError('invalid', 'invalid_csv'),
  );
  open();
  await choose();
  await confirm();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No rows were imported',
  );
  expect(screen.getByLabelText('Choose student CSV')).toBeEnabled();
  expect(
    screen.queryByRole('region', { name: 'CSV preview' }),
  ).not.toBeInTheDocument();
});
it.each(['session', 'forbidden'] as const)(
  'blocks controls and clears the selected CSV after %s rejection',
  async (kind) => {
    vi.mocked(importStudents).mockRejectedValue(
      new StudentRequestError(kind, 'denied'),
    );
    open();
    await choose();
    await confirm();
    await screen.findByRole('alert');
    expect(
      screen.queryByLabelText('Choose student CSV'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'CSV preview' }),
    ).not.toBeInTheDocument();
    if (kind === 'session') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Sign in again' }),
      );
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' });
    }
  },
);
it('keeps partial results but disables further imports when Admin authority changes during processing', async () => {
  const report = {
    ...importReportFixture,
    stopped_reason: 'forbidden' as const,
    rows: importReportFixture.rows.map((row) =>
      row.status === 'not_attempted'
        ? { ...row, error: 'forbidden' as const }
        : row,
    ),
  };
  vi.mocked(importStudents).mockResolvedValue(report);
  open();
  await choose();
  await confirm();
  await screen.findByRole('heading', { name: 'Import report' });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Administrator access changed',
  );
  expect(screen.queryByLabelText('Choose student CSV')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Prepare another CSV' }),
  ).not.toBeInTheDocument();
});
it('retries template download without submitting an import', async () => {
  vi.mocked(getStudentImportTemplate).mockRejectedValueOnce(new Error('503'));
  open();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Get CSV template' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Template unavailable',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Get CSV template' }),
  );
  await screen.findByRole('link', { name: 'Save CSV template' });
  expect(importStudents).not.toHaveBeenCalled();
});
it('protects unsent selections on navigation and allows an explicit discard', async () => {
  open();
  await choose();
  await userEvent.click(screen.getByRole('link', { name: 'Back to students' }));
  let dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByRole('button', { name: 'Stay on this page' }),
  ).toHaveFocus();
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Back to students' }));
  dialog = screen.getByRole('dialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Leave import' }),
  );
  await screen.findByRole('heading', { name: 'Students' });
  expect(importStudents).not.toHaveBeenCalled();
});
it('ignores a late file read after the page unmounts', async () => {
  let finish!: (value: Awaited<ReturnType<typeof readStudentCSV>>) => void;
  vi.mocked(readStudentCSV).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = open();
  fireEvent.change(await screen.findByLabelText('Choose student CSV'), {
    target: { files: [new File(['csv'], 'x.csv')] },
  });
  view.unmount();
  await act(async () =>
    finish({ file: new File(['csv'], 'x.csv'), records: [] }),
  );
  expect(importStudents).not.toHaveBeenCalled();
});
