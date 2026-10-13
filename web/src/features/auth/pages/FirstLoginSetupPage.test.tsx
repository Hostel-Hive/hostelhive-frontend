import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  loadFirstLoginPolicy,
  validateFirstLoginPassword,
} from '../api/first-login.api';
import { passwordPolicy } from '../../../test/fixtures/passwordPolicy';
import { login, logout } from '../api/auth.api';
vi.mock('../api/first-login.api', async (original) => ({
  ...(await original<typeof import('../api/first-login.api')>()),
  loadFirstLoginPolicy: vi.fn(),
  validateFirstLoginPassword: vi.fn(),
}));
vi.mock('../api/auth.api', async (original) => ({
  ...(await original<typeof import('../api/auth.api')>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreStaffSession: vi.fn().mockResolvedValue(null),
  subscribeStaffSession: vi.fn((callback: (signedIn: boolean) => void) => {
    let active = true;
    queueMicrotask(() => {
      if (active) callback(false);
    });
    return () => {
      active = false;
    };
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadFirstLoginPolicy).mockResolvedValue(passwordPolicy);
  vi.mocked(validateFirstLoginPassword).mockResolvedValue(true);
  window.history.replaceState({}, '', '/first-login');
});
async function openPage() {
  render(<App />);
  await screen.findByLabelText('New password', { exact: true });
  return userEvent.setup();
}
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  confirmation = 'SamplePass12!',
) {
  await user.type(
    screen.getByLabelText('New password', { exact: true }),
    'SamplePass12!',
  );
  await user.type(screen.getByLabelText('Confirm new password'), confirmation);
}
describe('first-login setup preview', () => {
  it('uses the shared layout, labels preview scope and shows configured requirements', async () => {
    await openPage();
    expect(
      screen.getByRole('heading', { name: 'Welcome to HostelHive.' }),
    ).toBeVisible();
    expect(screen.getByText(/UI preview only/)).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('contentinfo')).toBeVisible();
    expect(screen.getByText('At least 12 characters')).toBeVisible();
    expect(
      screen.getByLabelText('New password', { exact: true }),
    ).toHaveAttribute('type', 'password');
    expect(
      screen.queryByRole('button', { name: /Activate account/ }),
    ).not.toBeInTheDocument();
  });
  it('hides fields while policy loads', async () => {
    let finish!: (policy: typeof passwordPolicy) => void;
    vi.mocked(loadFirstLoginPolicy).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading password requirements',
    );
    expect(
      screen.queryByLabelText('New password', { exact: true }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish(passwordPolicy);
    });
    expect(
      screen.getByLabelText('New password', { exact: true }),
    ).toBeVisible();
  });
  it('supports retry after policy loading fails', async () => {
    vi.mocked(loadFirstLoginPolicy).mockRejectedValueOnce(
      new Error('private details'),
    );
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to check password requirements',
    );
    await user.click(
      screen.getByRole('button', { name: 'Retry loading requirements' }),
    );
    expect(
      await screen.findByLabelText('New password', { exact: true }),
    ).toBeVisible();
  });
  it('validates missing, weak and mismatched sample passwords with focus', async () => {
    const user = await openPage();
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(screen.getByText('Enter a sample password.')).toBeVisible();
    expect(
      screen.getByLabelText('New password', { exact: true }),
    ).toHaveFocus();
    await user.type(
      screen.getByLabelText('New password', { exact: true }),
      'weak',
    );
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(
      screen.getByText('Meet all password requirements below.'),
    ).toBeVisible();
    await user.clear(screen.getByLabelText('New password', { exact: true }));
    await fill(user, 'DifferentSample12!');
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(screen.getByLabelText('Confirm new password')).toHaveFocus();
    expect(validateFirstLoginPassword).not.toHaveBeenCalled();
  });
  it('validates samples, clears fields for retry and does not grant dashboard access', async () => {
    const user = await openPage();
    await fill(user);
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Preview complete.' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /No password was saved and no account or QR code was activated/,
      ),
    ).toBeVisible();
    expect(login).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Try another sample' }),
    );
    expect(screen.getByLabelText('New password', { exact: true })).toHaveValue(
      '',
    );
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
    await act(async () => {
      window.history.pushState({}, '', '/dashboard/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/login');
  });
  it('disables repeated submission while validation is pending', async () => {
    let finish!: (valid: boolean) => void;
    vi.mocked(validateFirstLoginPassword).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openPage();
    await fill(user);
    await user.dblClick(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(
      screen.getByRole('button', { name: 'Checking requirements…' }),
    ).toBeDisabled();
    expect(validateFirstLoginPassword).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(true);
    });
    expect(
      screen.getByRole('heading', { name: 'Preview complete.' }),
    ).toBeVisible();
  });
  it('handles stricter policy results without displaying success', async () => {
    vi.mocked(validateFirstLoginPassword).mockResolvedValue(false);
    const user = await openPage();
    await fill(user);
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(
      await screen.findByText(/does not meet the current policy/),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Preview complete.' }),
    ).not.toBeInTheDocument();
  });
  it('clears sample fields after validation failure and permits retry', async () => {
    vi.mocked(validateFirstLoginPassword).mockRejectedValueOnce(
      new Error('private network details'),
    );
    const user = await openPage();
    await fill(user);
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'private network details',
    );
    expect(screen.getByLabelText('New password', { exact: true })).toHaveValue(
      '',
    );
    await fill(user);
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Preview complete.' }),
    ).toBeVisible();
  });
  it('ignores pending validation after leaving the preview', async () => {
    let finish!: (valid: boolean) => void;
    vi.mocked(validateFirstLoginPassword).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await openPage();
    await fill(user);
    await user.click(
      screen.getByRole('button', { name: 'Preview password setup →' }),
    );
    await user.click(screen.getByRole('link', { name: /Back to sign in/ }));
    await act(async () => {
      finish(true);
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/login');
  });
});
