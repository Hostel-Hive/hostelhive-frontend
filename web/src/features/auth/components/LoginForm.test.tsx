import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import { login, restoreStaffSession } from '../api/auth.api';
import type { StaffAccount } from '../auth.types';

vi.mock('../api/auth.api', async (original) => ({
  ...(await original<typeof import('../api/auth.api')>()),
  login: vi.fn(),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn((change: (signedIn: boolean) => void) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  }),
}));

const account: StaffAccount = {
  user_id: 'staff-1',
  firebase_uid: 'firebase-1',
  email: 'staff@example.com',
  role: 'admin',
  is_active: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  window.history.replaceState({}, '', '/login');
});
async function openLogin() {
  render(<App />);
  await screen.findByRole('button', { name: 'Sign in' });
  return userEvent.setup();
}
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'staff@example.com');
  await user.type(
    screen.getByLabelText('Password', { exact: true }),
    'existing-password',
  );
}

describe('staff login', () => {
  it('opens login from the home route and exposes the shared layout', async () => {
    window.history.replaceState({}, '', '/');
    await openLogin();
    expect(window.location.pathname).toBe('/login');
    expect(
      screen.getByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('contentinfo')).toBeVisible();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('validates missing values and focuses the first invalid field', async () => {
    const user = await openLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Email'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'staff@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus();
  });

  it.each(['admin', 'warden'] as const)(
    'redirects verified %s accounts',
    async (role) => {
      vi.mocked(login).mockImplementation(async () => {
        vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
        return { ...account, role };
      });
      const user = await openLogin();
      await fillForm(user);
      await user.click(screen.getByLabelText('Keep me signed in'));
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(
        await screen.findByRole('heading', {
          name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
          level: 1,
        }),
      ).toBeVisible();
      expect(login).toHaveBeenCalledWith({
        email: 'staff@example.com',
        password: 'existing-password',
        rememberMe: true,
      });
      expect(window.location.pathname).toBe(`/dashboard/${role}`);
    },
  );

  it('shows a safe error, clears the password, and allows retry', async () => {
    vi.mocked(login).mockRejectedValue({ code: 'auth/invalid-credential' });
    const user = await openLogin();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your email and password',
    );
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(window.location.pathname).toBe('/login');
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ rememberMe: false }),
    );
    await user.type(
      screen.getByLabelText('Password', { exact: true }),
      'retry-password',
    );
    vi.mocked(login).mockImplementation(async () => {
      vi.mocked(restoreStaffSession).mockResolvedValue(account);
      return account;
    });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { name: 'Admin dashboard', level: 1 }),
    ).toBeVisible();
  });

  it('disables submission while login is pending', async () => {
    let rejectLogin!: (reason: unknown) => void;
    vi.mocked(login).mockReturnValue(
      new Promise((_, reject) => {
        rejectLogin = reject;
      }),
    );
    const user = await openLogin();
    await fillForm(user);
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectLogin(new Error('private details'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in is unavailable',
    );
    expect(screen.queryByText('private details')).not.toBeInTheDocument();
  });

  it.each(['admin', 'warden'] as const)(
    'restores a verified %s session',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
      render(<App />);
      expect(
        await screen.findByRole('heading', {
          name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
          level: 1,
        }),
      ).toBeVisible();
    },
  );

  it('does not redirect after leaving a pending login', async () => {
    let resolveLogin!: (account: StaffAccount) => void;
    vi.mocked(login).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const user = await openLogin();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    await act(async () => {
      resolveLogin(account);
    });
    expect(window.location.pathname).toBe('/forgot-password');
    expect(
      screen.getByRole('heading', { name: 'Forgot your password?' }),
    ).toBeVisible();
  });

  it('handles restoration errors and supports signing in again', async () => {
    vi.mocked(restoreStaffSession).mockRejectedValue({
      code: 'auth/network-request-failed',
    });
    await openLogin();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Check your connection',
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('finishes verification after leaving and returning during pending login', async () => {
    let finish!: (account: StaffAccount) => void;
    vi.mocked(login).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openLogin();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Signing in…' }));
    expect(login).toHaveBeenCalledTimes(1);
    vi.mocked(restoreStaffSession).mockResolvedValue(account);
    await act(async () => {
      finish(account);
    });
    expect(
      await screen.findByRole('heading', { name: 'Admin dashboard', level: 1 }),
    ).toBeVisible();
  });

  it('provides a working recovery destination and return link', async () => {
    const user = await openLogin();
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(
      screen.getByRole('heading', { name: 'Forgot your password?' }),
    ).toBeVisible();
    expect(screen.getByText(/Enter your account email address/)).toBeVisible();
    await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeVisible();
  });
});
