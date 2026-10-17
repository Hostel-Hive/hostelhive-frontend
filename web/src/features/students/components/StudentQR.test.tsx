import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudentQR from './StudentQR';
import { getStudentQR } from '../api/student-qr.api';
import { StudentRequestError } from '../api/students.api';
import { studentFixture } from '../../../test/fixtures/student';
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../auth/hooks/useAuth', () => ({ default: () => ({ signOut }) }));
vi.mock('../api/student-qr.api', () => ({ getStudentQR: vi.fn() }));
const blob = new Blob(['private-png'], { type: 'image/png' });
const createURL = vi.fn();
const revokeURL = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', {
    createObjectURL: createURL.mockReturnValue('blob:private-qr'),
    revokeObjectURL: revokeURL,
  });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.mocked(getStudentQR).mockResolvedValue(blob);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function show(student = studentFixture, uid = 'staff-uid') {
  return render(<StudentQR student={student} uid={uid} />);
}
async function reveal() {
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  const image = await screen.findByAltText(/Student identification QR code/);
  fireEvent.load(image);
  return image;
}
it('waits for explicit retrieval and offers a private PNG download only after image decode', async () => {
  show();
  expect(getStudentQR).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  const image = await screen.findByAltText(/QR code for Alex Morgan/);
  expect(image).toHaveAttribute('src', 'blob:private-qr');
  expect(image).toHaveAttribute('width', '320');
  expect(
    screen.queryByRole('link', { name: 'Download QR PNG' }),
  ).not.toBeInTheDocument();
  fireEvent.load(image);
  const link = screen.getByRole('link', { name: 'Download QR PNG' });
  expect(link).toHaveAttribute('href', 'blob:private-qr');
  expect(link).toHaveAttribute('download', 'student-qr.png');
  expect(getStudentQR).toHaveBeenCalledWith(
    studentFixture.student_id,
    'staff-uid',
    expect.any(AbortSignal),
  );
});
it('does not request QR for an inactive account', () => {
  show({ ...studentFixture, account_active: false });
  expect(screen.getByRole('status')).toHaveTextContent('inactive');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(getStudentQR).not.toHaveBeenCalled();
});
it('hides the QR, revokes its URL and returns focus to the show button', async () => {
  show();
  await reveal();
  await userEvent.click(screen.getByRole('button', { name: 'Hide QR code' }));
  expect(
    screen.queryByAltText(/identification QR code/),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(revokeURL).toHaveBeenCalledWith('blob:private-qr');
  expect(screen.getByRole('button', { name: 'Show QR code' })).toHaveFocus();
});
it('prevents duplicate requests and allows hiding a pending request', async () => {
  let finish!: (image: Blob) => void;
  vi.mocked(getStudentQR).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  show();
  const button = screen.getByRole('button', { name: 'Show QR code' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(getStudentQR).toHaveBeenCalledOnce();
  const signal = vi.mocked(getStudentQR).mock.calls[0][2];
  expect(
    screen.getByRole('button', { name: 'Loading QR code…' }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Hide QR code' }));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(blob));
  expect(
    screen.queryByAltText(/identification QR code/),
  ).not.toBeInTheDocument();
  expect(createURL).not.toHaveBeenCalled();
});
it.each([
  'session',
  'forbidden',
  'not-found',
  'invalid',
  'unavailable',
] as const)(
  'handles %s without exposing an old code or raw server details',
  async (kind) => {
    show();
    await reveal();
    vi.mocked(getStudentQR).mockRejectedValue(
      new StudentRequestError(kind, 'private server details'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh QR code' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('private server details');
    expect(
      screen.queryByRole('link', { name: 'Download QR PNG' }),
    ).not.toBeInTheDocument();
    expect(revokeURL).toHaveBeenCalled();
    if (kind === 'session') {
      await userEvent.click(
        screen.getByRole('button', { name: 'Sign in again' }),
      );
      expect(signOut).toHaveBeenCalledOnce();
    }
    if (kind === 'session' || kind === 'forbidden')
      expect(
        screen.queryByRole('button', { name: 'Retry QR code' }),
      ).not.toBeInTheDocument();
    else {
      vi.mocked(getStudentQR).mockResolvedValue(blob);
      await userEvent.click(
        screen.getByRole('button', { name: 'Retry QR code' }),
      );
      await screen.findByAltText(/identification QR code/);
    }
  },
);
it('clears the visible image when the browser page becomes hidden and does not reissue on return', async () => {
  show();
  await reveal();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(
    screen.queryByAltText(/identification QR code/),
  ).not.toBeInTheDocument();
  expect(revokeURL).toHaveBeenCalled();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(getStudentQR).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Show QR code' })).toBeEnabled();
});
it('aborts pending retrieval on tab hiding and rejects late responses', async () => {
  let finish!: (image: Blob) => void;
  vi.mocked(getStudentQR).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  const signal = vi.mocked(getStudentQR).mock.calls[0][2];
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(blob));
  expect(createURL).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  expect(getStudentQR).toHaveBeenCalledOnce();
});
it('aborts on unmount and never displays a response that resolves afterward', async () => {
  let finish!: (image: Blob) => void;
  vi.mocked(getStudentQR).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  const signal = vi.mocked(getStudentQR).mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(blob));
  expect(createURL).not.toHaveBeenCalled();
});
it('revokes the old image when switching students, staff sessions or account eligibility', async () => {
  const view = show();
  await reveal();
  view.rerender(
    <StudentQR
      student={{
        ...studentFixture,
        student_id: studentFixture.user_id,
        full_name: 'Another student',
      }}
      uid="staff-uid"
    />,
  );
  expect(screen.queryByAltText(/Alex Morgan/)).not.toBeInTheDocument();
  expect(revokeURL).toHaveBeenCalledOnce();
  await reveal();
  view.rerender(<StudentQR student={studentFixture} uid="other-staff" />);
  expect(
    screen.queryByAltText(/identification QR code/),
  ).not.toBeInTheDocument();
  await reveal();
  view.rerender(
    <StudentQR
      student={{ ...studentFixture, account_active: false }}
      uid="other-staff"
    />,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(revokeURL).toHaveBeenCalledTimes(3);
});
it('handles browser image decode errors without offering a broken download', async () => {
  show();
  const image = await reveal();
  fireEvent.error(image);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to display');
  expect(
    screen.queryByRole('link', { name: 'Download QR PNG' }),
  ).not.toBeInTheDocument();
  expect(revokeURL).toHaveBeenCalled();
});
it('does not let a late cancelled response replace a newer QR request', async () => {
  let old!: (image: Blob) => void;
  vi.mocked(getStudentQR).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
  await userEvent.click(screen.getByRole('button', { name: 'Hide QR code' }));
  await reveal();
  const count = createURL.mock.calls.length;
  await act(async () => old(new Blob(['old'])));
  expect(createURL).toHaveBeenCalledTimes(count);
  expect(
    screen.getByRole('link', { name: 'Download QR PNG' }),
  ).toBeInTheDocument();
});
