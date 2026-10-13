import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  logout,
  restoreStaffSession,
  SessionRejectedError,
  subscribeStaffSession,
} from '../features/auth/api/auth.api';
import type { StaffAccount } from '../features/auth/auth.types';

vi.mock('../features/auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../features/auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  logout: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
const admin: StaffAccount = {
  user_id: 'staff-1',
  firebase_uid: 'uid-1',
  email: 'staff@example.com',
  role: 'admin',
  is_active: true,
};
let notify: (signedIn: boolean) => void;
let notifyError: (error: unknown) => void;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(admin);
  vi.mocked(logout).mockImplementation(async () => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
  });
  vi.mocked(subscribeStaffSession).mockImplementation((change, error) => {
    let active = true;
    notify = change;
    notifyError = error;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  window.history.replaceState({}, '', '/');
});
function renderAt(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
async function expectDashboard(role: 'admin' | 'warden') {
  expect(
    await screen.findByRole('heading', {
      name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
      level: 1,
    }),
  ).toBeVisible();
  expect(window.location.pathname).toBe(`/dashboard/${role}`);
}

describe('protected dashboard access', () => {
  it.each(['/dashboard', '/dashboard/admin', '/dashboard/warden'])(
    'redirects signed-out direct access from %s',
    async (path) => {
      vi.mocked(restoreStaffSession).mockResolvedValue(null);
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
      ).toBeVisible();
      expect(window.location.pathname).toBe('/login');
      expect(
        screen.queryByRole('navigation', { name: 'Primary navigation' }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['admin', 'warden'] as const)(
    'verifies %s access, refresh and role-filtered navigation',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({ ...admin, role });
      const view = renderAt(`/dashboard/${role}`);
      await expectDashboard(role);
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      const nav = within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      );
      expect(nav.getAllByRole('link')).toHaveLength(2);
      expect(
        nav.getByRole('link', {
          name: role === 'admin' ? 'Admin dashboard' : 'Warden dashboard',
        }),
      ).toHaveAttribute('aria-current', 'page');
      expect(nav.getByRole('link', { name: 'Students' })).toHaveAttribute(
        'href',
        '/dashboard/students',
      );
      view.unmount();
      renderAt(`/dashboard/${role}`);
      await expectDashboard(role);
      expect(restoreStaffSession).toHaveBeenCalledTimes(2);
    },
  );
  it.each(['admin', 'warden'] as const)(
    'redirects %s from the other role dashboard',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({ ...admin, role });
      renderAt(role === 'admin' ? '/dashboard/warden' : '/dashboard/admin');
      expect(
        screen.queryByRole('heading', {
          name: role === 'admin' ? 'Warden dashboard' : 'Admin dashboard',
        }),
      ).not.toBeInTheDocument();
      await expectDashboard(role);
    },
  );
  it.each(['admin', 'warden'] as const)(
    'routes %s away from login to their own dashboard',
    async (role) => {
      vi.mocked(restoreStaffSession).mockResolvedValue({ ...admin, role });
      renderAt('/login');
      await expectDashboard(role);
    },
  );
  it('hides all dashboard content during restoration', async () => {
    let finish!: (account: StaffAccount) => void;
    vi.mocked(restoreStaffSession).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderAt('/dashboard/admin');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your session',
    );
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    await act(async () => {
      finish(admin);
    });
    await expectDashboard('admin');
  });
  it('blocks content during a service failure, then retries successfully', async () => {
    vi.mocked(restoreStaffSession).mockRejectedValueOnce(
      new Error('private error details'),
    );
    const user = userEvent.setup();
    renderAt('/dashboard/admin');
    expect(
      await screen.findByRole('heading', {
        name: 'Unable to verify your session',
      }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private error details',
    );
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Retry verification' }),
    );
    await expectDashboard('admin');
  });
  it.each(['expired', 'inactive', 'unsupported'])(
    'rejects a permanently %s session',
    async (reason) => {
      vi.mocked(restoreStaffSession)
        .mockRejectedValueOnce(new SessionRejectedError(`Session ${reason}.`))
        .mockResolvedValue(null);
      renderAt('/dashboard/admin');
      expect(
        await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
      ).toBeVisible();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    },
  );
  it('signs out, blocks browser-back access, and ignores stale verification results', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard/admin');
    await expectDashboard('admin');
    let finish!: (account: StaffAccount) => void;
    vi.mocked(restoreStaffSession).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await act(async () => {
      notify(true);
    });
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    // External sign-out must invalidate the pending account response immediately.
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
    await act(async () => {
      notify(false);
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    await act(async () => {
      finish(admin);
    });
    expect(window.location.pathname).toBe('/login');
    // Simulate back navigation to a protected URL.
    await act(async () => {
      window.history.pushState({}, '', '/dashboard/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/login');
    // Re-enter a verified account to exercise the visible sign-out control.
    vi.mocked(restoreStaffSession).mockResolvedValue(admin);
    await act(async () => {
      notify(true);
    });
    await expectDashboard('admin');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(logout).toHaveBeenCalledTimes(1);
  });
  it('hides content if sign-out fails and offers another sign-out attempt', async () => {
    vi.mocked(logout).mockRejectedValueOnce(new Error('private logout error'));
    const user = userEvent.setup();
    renderAt('/dashboard/admin');
    await expectDashboard('admin');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign out',
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
  });
  it('rechecks changes to roles and active status on window focus', async () => {
    renderAt('/dashboard/admin');
    await expectDashboard('admin');
    vi.mocked(restoreStaffSession).mockResolvedValue({
      ...admin,
      role: 'warden',
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await expectDashboard('warden');
    vi.mocked(restoreStaffSession)
      .mockRejectedValueOnce(new SessionRejectedError('Inactive account.'))
      .mockResolvedValue(null);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
  });
  it('blocks content on observer errors', async () => {
    renderAt('/dashboard/admin');
    await expectDashboard('admin');
    await act(async () => {
      notifyError(new Error('private observer error'));
    });
    expect(
      screen.getByRole('heading', { name: 'Unable to verify your session' }),
    ).toBeVisible();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });
  it('handles subscription initialization failure without exposing content', async () => {
    vi.mocked(subscribeStaffSession).mockImplementation(() => {
      throw new Error('private setup error');
    });
    renderAt('/dashboard/admin');
    expect(
      await screen.findByRole('heading', {
        name: 'Unable to verify your session',
      }),
    ).toBeVisible();
  });
  it.each(['/missing-page', '/dashboard/unknown'])(
    'recovers from unknown route %s',
    async (path) => {
      const user = userEvent.setup();
      renderAt(path);
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
      await user.click(
        screen.getByRole('link', { name: 'Return to dashboard' }),
      );
      await expectDashboard('admin');
    },
  );
});
