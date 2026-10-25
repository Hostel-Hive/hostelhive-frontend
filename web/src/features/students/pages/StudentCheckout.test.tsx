import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getStudent, listStudents } from '../api/students.api';
import { checkoutStudent, CheckoutError } from '../api/student-checkout.api';
import {
  listAllocations,
  AllocationError,
} from '../../allocation/api/allocation.api';
import {
  studentFixture,
  studentPageFixture,
} from '../../../test/fixtures/student';
import {
  allocationFixture,
  allocationPage,
} from '../../../test/fixtures/allocation';
import { checkoutResultFixture } from '../../../test/fixtures/student-checkout';

vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../api/students.api', async (original) => ({
  ...(await original<typeof import('../api/students.api')>()),
  getStudent: vi.fn(),
  listStudents: vi.fn(),
}));
vi.mock('../api/student-checkout.api', async (original) => ({
  ...(await original<typeof import('../api/student-checkout.api')>()),
  checkoutStudent: vi.fn(),
}));
vi.mock('../../allocation/api/allocation.api', async (original) => ({
  ...(await original<typeof import('../../allocation/api/allocation.api')>()),
  listAllocations: vi.fn(),
}));
vi.mock('../../allocation/components/StudentAccommodation', () => ({
  default: () => null,
}));
vi.mock('../../attendance/components/StudentAttendance', () => ({
  default: () => null,
}));
vi.mock('../components/StudentPhoto', () => ({ default: () => null }));
vi.mock('../components/StudentQR', () => ({ default: () => null }));
const show = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const close = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
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
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: '14141414-1414-4414-8414-141414141414',
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
  vi.mocked(getStudent).mockResolvedValue(studentFixture);
  vi.mocked(listStudents).mockResolvedValue({
    ...studentPageFixture,
    students: [],
  });
  vi.mocked(listAllocations).mockResolvedValue(
    allocationPage([allocationFixture]),
  );
  vi.mocked(checkoutStudent).mockImplementation(
    async (_id, _user, _uid, input) => checkoutResultFixture(input),
  );
});
function renderProfile() {
  window.history.replaceState(
    {},
    '',
    `/dashboard/students/${studentFixture.student_id}?faculty=Science&offset=20`,
  );
  return render(<App />);
}
async function openCheckout() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'End hostel stay' }),
  );
  return screen.getByRole('dialog');
}
async function fill(choice: 'deactivate' | 'keep' = 'deactivate') {
  await waitFor(() =>
    expect(screen.getByLabelText('Reason for leaving')).toBeEnabled(),
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Reason for leaving'),
    'graduated',
  );
  await userEvent.type(
    screen.getByLabelText('Departure notes (optional)'),
    'Completed clearance',
  );
  await userEvent.click(
    screen.getByRole('radio', {
      name:
        choice === 'deactivate'
          ? 'Deactivate account — block HostelHive access'
          : 'Keep current account access',
    }),
  );
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I confirm this student/ }),
  );
}
it('requires explicit confirmation and access choice, then shows the actual receipt and refreshes archived students', async () => {
  renderProfile();
  const dialog = await openCheckout();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(await screen.findByText(allocationFixture.bed_id)).toBeVisible();
  expect(
    screen.getByRole('radio', { name: 'Keep current account access' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  ).toBeDisabled();
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Hostel stay ended' }),
  ).toHaveFocus();
  expect(screen.getByText('Inactive — local access blocked')).toBeVisible();
  expect(
    screen.getByText(/Firebase session revocation is still pending/),
  ).toBeVisible();
  const [id, user, uid, input] = vi.mocked(checkoutStudent).mock.calls[0];
  expect([id, user, uid]).toEqual([
    studentFixture.student_id,
    studentFixture.user_id,
    'admin-uid',
  ]);
  expect(input).toMatchObject({
    reason: 'graduated',
    deactivate_account: true,
    confirmed: true,
  });
  expect(input.request_id).toMatch(/^[a-f0-9-]{36}$/);
  await userEvent.click(
    screen.getByRole('button', { name: 'View archived students' }),
  );
  await screen.findByRole('heading', { name: 'Students' });
  expect(window.location.search).toContain('status=archived');
  expect(window.location.search).not.toContain('offset');
  expect(
    await screen.findByText('Hostel stay ended successfully.'),
  ).toBeVisible();
  expect(listStudents).toHaveBeenCalled();
});
it('cancels with Escape without a request and restores trigger focus', async () => {
  renderProfile();
  const dialog = await openCheckout();
  fireEvent(dialog, new Event('cancel', { cancelable: true, bubbles: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'End hostel stay' })).toHaveFocus();
  expect(checkoutStudent).not.toHaveBeenCalled();
});

it('keeps the original operation across an uncertain response, close and reopen', async () => {
  vi.mocked(checkoutStudent)
    .mockRejectedValueOnce(
      new CheckoutError('unavailable', 'Unknown checkout outcome'),
    )
    .mockImplementationOnce(async (_id, _user, _uid, input) => ({
      ...checkoutResultFixture(input),
      replayed: true,
    }));
  renderProfile();
  await openCheckout();
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  );
  await screen.findByRole('button', { name: 'Retry same checkout' });
  expect(screen.getByLabelText('Reason for leaving')).toBeDisabled();
  expect(screen.getByLabelText('Departure notes (optional)')).toBeDisabled();
  const original = vi.mocked(checkoutStudent).mock.calls[0][3];
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Resume checkout' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry same checkout' }),
  );
  await screen.findByRole('heading', { name: 'Original checkout confirmed' });
  expect(vi.mocked(checkoutStudent).mock.calls[1][3]).toEqual(original);
  expect(screen.getByText(/No new checkout was performed/)).toBeVisible();
});
it('prevents duplicate requests, Escape and reload during submission, and aborts on unmount', async () => {
  vi.mocked(checkoutStudent).mockImplementation(() => new Promise(() => {}));
  const view = renderProfile();
  const dialog = await openCheckout();
  await fill();
  await userEvent.dblClick(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  );
  expect(checkoutStudent).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(dialog, new Event('cancel', { cancelable: true, bubbles: true }));
  expect(dialog).toBeVisible();
  const reload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(reload);
  expect(reload.defaultPrevented).toBe(true);
  const requestSignal = vi.mocked(checkoutStudent).mock.calls[0][4];
  view.unmount();
  expect(requestSignal.aborted).toBe(true);
});
it('supports no-bed departures and explicitly preserving an inactive account', async () => {
  vi.mocked(getStudent).mockResolvedValue({
    ...studentFixture,
    account_active: false,
  });
  vi.mocked(listAllocations).mockResolvedValue(allocationPage());
  vi.mocked(checkoutStudent).mockImplementation(
    async (_id, _user, _uid, input) => {
      const result = checkoutResultFixture(input);
      result.checkout.released_allocation_id = null;
      result.checkout.released_bed_id = null;
      result.checkout.account_active_after = false;
      return result;
    },
  );
  renderProfile();
  await openCheckout();
  expect(
    await screen.findByText(/No bed is currently allocated/),
  ).toBeVisible();
  await fill('keep');
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  );
  expect(await screen.findByText('No bed was allocated')).toBeVisible();
  expect(vi.mocked(checkoutStudent).mock.calls[0][3].deactivate_account).toBe(
    false,
  );
});
it('blocks confirmation until accommodation has been checked successfully', async () => {
  vi.mocked(listAllocations).mockRejectedValueOnce(
    new AllocationError('unavailable', 'Accommodation unavailable'),
  );
  renderProfile();
  const dialog = await openCheckout();
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'bed must be checked',
  );
  expect(
    screen.getByRole('button', { name: 'Confirm end hostel stay' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry accommodation check' }),
  );
  expect(await screen.findByText(allocationFixture.bed_id)).toBeVisible();
  expect(checkoutStudent).not.toHaveBeenCalled();
});
it.each(['forbidden', 'account', 'conflict', 'already-ended'] as const)(
  'does not blindly retry %s failures',
  async (kind) => {
    vi.mocked(checkoutStudent).mockRejectedValue(
      new CheckoutError(kind, 'Review the directory'),
    );
    renderProfile();
    const dialog = await openCheckout();
    await fill();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm end hostel stay' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Review the directory',
    );
    expect(
      screen.getByRole('button', { name: 'Confirm end hostel stay' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Retry same checkout' }),
    ).not.toBeInTheDocument();
  },
);
it('does not expose checkout to a Warden', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'staff',
    firebase_uid: 'warden-uid',
    email: 'warden@example.com',
    role: 'warden',
    is_active: true,
  });
  renderProfile();
  await screen.findByRole('heading', { name: studentFixture.full_name });
  expect(
    screen.queryByRole('button', { name: 'End hostel stay' }),
  ).not.toBeInTheDocument();
  expect(checkoutStudent).not.toHaveBeenCalled();
});
