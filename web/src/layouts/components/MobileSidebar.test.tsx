import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../features/auth/hooks/useAuth', () => ({
  default: () => ({ account: { role: 'admin' }, signOut }),
}));
import MobileSidebar from './MobileSidebar';

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/admin']}>
      <MobileSidebar />
    </MemoryRouter>,
  );
}

describe('mobile navigation', () => {
  it('provides sign-out inside the mobile menu', async () => {
    const user = userEvent.setup();
    renderMenu();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
  it('opens and closes using the keyboard and exposes the expanded state', async () => {
    const user = userEvent.setup();
    renderMenu();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('navigation', { name: 'Mobile navigation' }),
    ).toBeVisible();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.tab();
    await user.keyboard('x');
    expect(
      screen.getByRole('button', { name: 'Close navigation' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toHaveFocus();
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
  });

  it('closes using the explicit close button', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toHaveFocus();
  });

  it('closes after a navigation link is selected', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Mobile navigation' }),
      ).getByRole('link', { name: 'Admin dashboard' }),
    );
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
});
