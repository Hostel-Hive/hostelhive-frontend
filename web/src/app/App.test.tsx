import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

beforeEach(() => window.history.replaceState({}, '', '/'));

function renderAt(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

describe('dashboard routing', () => {
  it.each(['/', '/dashboard', '/dashboard/admin'])(
    'renders the admin dashboard within the layout given %s',
    async (path) => {
      renderAt(path);
      expect(
        await screen.findByRole('heading', {
          name: 'Admin dashboard',
          level: 1,
        }),
      ).toBeVisible();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      expect(window.location.pathname).toBe('/dashboard/admin');
      expect(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: 'Admin dashboard' }),
      ).toHaveAttribute('aria-current', 'page');
    },
  );

  it('renders the warden dashboard given a direct URL', () => {
    renderAt('/dashboard/warden');
    expect(
      screen.getByRole('heading', { name: 'Warden dashboard', level: 1 }),
    ).toBeVisible();
  });

  it('changes routes and active navigation when a sidebar link is selected', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard/admin');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    );
    await user.click(
      navigation.getByRole('link', { name: 'Warden dashboard' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Warden dashboard',
        level: 1,
      }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/dashboard/warden');
    expect(
      navigation.getByRole('link', { name: 'Warden dashboard' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      navigation.getByRole('link', { name: 'Admin dashboard' }),
    ).not.toHaveAttribute('aria-current');
    await user.click(
      screen.getByRole('link', { name: 'HostelHive dashboard' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Admin dashboard', level: 1 }),
    ).toBeVisible();
  });

  it.each(['/missing-page', '/dashboard/unknown'])(
    'shows Not Found for %s and returns to the dashboard',
    async (path) => {
      const user = userEvent.setup();
      renderAt(path);
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      await user.click(
        screen.getByRole('link', { name: 'Return to dashboard' }),
      );
      expect(
        await screen.findByRole('heading', {
          name: 'Admin dashboard',
          level: 1,
        }),
      ).toBeVisible();
    },
  );
});
