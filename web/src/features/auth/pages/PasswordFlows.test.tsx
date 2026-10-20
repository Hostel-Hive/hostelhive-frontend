import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordRecoveryPage from './PasswordRecoveryPage';
import ResetPasswordPage from './ResetPasswordPage';
import {
  completePasswordReset,
  inspectResetLink,
  requestPasswordReset,
} from '../api/password.api';
import { passwordPolicy } from '../../../test/fixtures/passwordPolicy';
const signOut = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAuth', () => ({ default: () => ({ signOut }) }));
vi.mock('../api/password.api', async (original) => ({
  ...(await original<typeof import('../api/password.api')>()),
  completePasswordReset: vi.fn(),
  inspectResetLink: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  signOut.mockResolvedValue(undefined);
  vi.mocked(requestPasswordReset).mockResolvedValue(undefined);
  vi.mocked(inspectResetLink).mockResolvedValue({
    email: 'staff@example.com',
    policy: passwordPolicy,
  });
  vi.mocked(completePasswordReset).mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <span data-testid="url">
        {location.pathname}
        {location.search}
      </span>
      <Link to="/reset-password?mode=resetPassword&oobCode=another-code">
        Open another reset link
      </Link>
    </>
  );
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/student/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<h1>Student sign-in destination</h1>} />
        <Route path="/staff/login" element={<h1>Sign-in destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function openReset() {
  renderAt('/reset-password?mode=resetPassword&oobCode=test-code');
  await screen.findByLabelText('New password', { exact: true });
  return userEvent.setup();
}
async function fillPasswords(
  user: ReturnType<typeof userEvent.setup>,
  confirmation = 'StrongPass12!',
) {
  await user.type(
    screen.getByLabelText('New password', { exact: true }),
    'StrongPass12!',
  );
  await user.type(screen.getByLabelText('Confirm new password'), confirmation);
}
describe('password recovery screens', () => {
  it.each([
    '/student/reset-password?mode=resetPassword&oobCode=test-code',
    `/reset-password?mode=resetPassword&oobCode=test-code&continueUrl=${encodeURIComponent(`${window.location.origin}/login`)}`,
    `/reset-password?mode=resetPassword&oobCode=test-code&continueUrl=${encodeURIComponent(`${window.location.origin}/student/login`)}`,
  ])(
    'returns student reset flow to the student login after clearing action parameters: %s',
    async (path) => {
      renderAt(path);
      await screen.findByLabelText('New password', { exact: true });
      expect(screen.getByTestId('url').textContent).not.toContain('oobCode');
      const user = userEvent.setup();
      await fillPasswords(user);
      await user.click(screen.getByRole('button', { name: 'Update password' }));
      await user.click(
        await screen.findByRole('link', { name: 'Sign in with new password' }),
      );
      expect(
        screen.getByRole('heading', { name: 'Student sign-in destination' }),
      ).toBeVisible();
    },
  );
  it('validates email, focuses invalid input and confirms requests generically', async () => {
    const user = userEvent.setup();
    renderAt('/forgot-password');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter your email address.')).toBeVisible();
    expect(screen.getByLabelText('Account email')).toHaveFocus();
    await user.type(screen.getByLabelText('Account email'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(requestPasswordReset).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Account email'));
    await user.type(
      screen.getByLabelText('Account email'),
      'staff@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByRole('heading', { name: 'Check your inbox.' }),
    ).toBeVisible();
    expect(
      screen.getByText(/If an account exists for that address/),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend link in 60s' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Use a different email' }),
    );
    expect(screen.getByLabelText('Account email')).toBeVisible();
  });
  it('supports cooldown and resend', async () => {
    vi.useFakeTimers();
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Account email'), {
      target: { value: 'staff@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });
    expect(
      screen.getByRole('button', { name: 'Resend link in 60s' }),
    ).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    });
    expect(requestPasswordReset).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: 'Resend link in 60s' }),
    ).toBeDisabled();
  });
  it('prevents duplicate requests and reports connection failure without claiming email delivery', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(requestPasswordReset).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const user = userEvent.setup();
    renderAt('/forgot-password');
    await user.type(
      screen.getByLabelText('Account email'),
      'staff@example.com',
    );
    await user.dblClick(
      screen.getByRole('button', { name: 'Send reset link' }),
    );
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject({ code: 'auth/network-request-failed' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Check your connection',
    );
    expect(
      screen.queryByRole('heading', { name: 'Check your inbox.' }),
    ).not.toBeInTheDocument();
  });
  it('ignores late results after leaving the request page', async () => {
    let finish!: () => void;
    vi.mocked(requestPasswordReset).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderAt('/forgot-password');
    await user.type(
      screen.getByLabelText('Account email'),
      'staff@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
    await act(async () => {
      finish();
    });
    expect(
      screen.getByRole('heading', { name: 'Sign-in destination' }),
    ).toBeVisible();
  });
});
describe('password reset action handler', () => {
  it('discards the previous account and password when opening another action link', async () => {
    const user = await openReset();
    await user.type(
      screen.getByLabelText('New password', { exact: true }),
      'OldPassword12!',
    );
    vi.mocked(inspectResetLink).mockResolvedValue({
      email: 'other@example.com',
      policy: passwordPolicy,
    });
    await user.click(
      screen.getByRole('link', { name: 'Open another reset link' }),
    );
    expect(await screen.findByText('other@example.com')).toBeVisible();
    expect(screen.queryByText('staff@example.com')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password', { exact: true })).toHaveValue(
      '',
    );
    expect(inspectResetLink).toHaveBeenLastCalledWith('another-code');
  });
  it.each([
    '/reset-password',
    '/reset-password?mode=verifyEmail&oobCode=test-code',
  ])(
    'rejects missing or wrong-mode links %s without contacting Firebase',
    async (path) => {
      renderAt(path);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'invalid, expired or already used',
      );
      expect(inspectResetLink).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText('New password', { exact: true }),
      ).not.toBeInTheDocument();
    },
  );
  it('keeps fields hidden while Firebase checks a code and strips the URL', async () => {
    let finish!: (value: {
      email: string;
      policy: typeof passwordPolicy;
    }) => void;
    vi.mocked(inspectResetLink).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderAt(
      '/reset-password?mode=resetPassword&oobCode=test-code&continueUrl=https://untrusted.example',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your reset link',
    );
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/reset-password$/);
    expect(
      screen.queryByLabelText('New password', { exact: true }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish({ email: 'staff@example.com', policy: passwordPolicy });
    });
    expect(
      screen.getByLabelText('New password', { exact: true }),
    ).toHaveAttribute('type', 'password');
    expect(screen.getByText('At least 12 characters')).toBeVisible();
  });
  it.each(['auth/expired-action-code', 'auth/invalid-action-code'])(
    'shows recovery for %s',
    async (code) => {
      vi.mocked(inspectResetLink).mockRejectedValue({ code });
      const user = userEvent.setup();
      renderAt('/reset-password?mode=resetPassword&oobCode=test-code');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'invalid, expired or already used',
      );
      await user.click(
        screen.getByRole('link', { name: 'Request a new reset link' }),
      );
      expect(
        screen.getByRole('heading', { name: 'Forgot your password?' }),
      ).toBeVisible();
    },
  );
  it('retries service failures before exposing password fields', async () => {
    vi.mocked(inspectResetLink).mockRejectedValueOnce({
      code: 'auth/network-request-failed',
    });
    const user = userEvent.setup();
    renderAt('/reset-password?mode=resetPassword&oobCode=test-code');
    await user.click(
      await screen.findByRole('button', { name: 'Retry link verification' }),
    );
    expect(
      await screen.findByLabelText('New password', { exact: true }),
    ).toBeVisible();
  });
  it('validates required fields, policy and confirmation before resetting', async () => {
    const user = await openReset();
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByText('Enter a new password.')).toBeVisible();
    expect(
      screen.getByLabelText('New password', { exact: true }),
    ).toHaveFocus();
    await user.type(
      screen.getByLabelText('New password', { exact: true }),
      'weak',
    );
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(
      screen.getByText('Meet all password requirements below.'),
    ).toBeVisible();
    await user.clear(screen.getByLabelText('New password', { exact: true }));
    await fillPasswords(user, 'DifferentPass12!');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(screen.getByLabelText('Confirm new password')).toHaveFocus();
    expect(completePasswordReset).not.toHaveBeenCalled();
  });
  it('resets once, clears local sign-in state, and offers sign-in with the new password', async () => {
    const user = await openReset();
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(
      await screen.findByRole('heading', { name: 'You’re all set.' }),
    ).toBeVisible();
    expect(completePasswordReset).toHaveBeenCalledWith(
      'test-code',
      'StrongPass12!',
    );
    expect(signOut).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole('link', { name: 'Sign in with new password' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Sign-in destination' }),
    ).toBeVisible();
  });
  it('disables duplicate reset attempts and handles a link expiring during submission', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(completePasswordReset).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const user = await openReset();
    await fillPasswords(user);
    await user.dblClick(
      screen.getByRole('button', { name: 'Update password' }),
    );
    expect(
      screen.getByRole('button', { name: 'Updating password…' }),
    ).toBeDisabled();
    expect(completePasswordReset).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject({ code: 'auth/expired-action-code' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'invalid, expired or already used',
    );
    expect(
      screen.queryByLabelText('New password', { exact: true }),
    ).not.toBeInTheDocument();
  });
  it('clears password fields after a service failure and permits a new attempt', async () => {
    vi.mocked(completePasswordReset).mockRejectedValueOnce({
      code: 'auth/network-request-failed',
    });
    const user = await openReset();
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your connection',
    );
    expect(screen.getByLabelText('New password', { exact: true })).toHaveValue(
      '',
    );
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(
      await screen.findByRole('heading', { name: 'You’re all set.' }),
    ).toBeVisible();
  });
  it('ignores reset completion after navigating away', async () => {
    let finish!: () => void;
    vi.mocked(completePasswordReset).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openReset();
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
    await act(async () => {
      finish();
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Sign-in destination' }),
    ).toBeVisible();
  });
});
