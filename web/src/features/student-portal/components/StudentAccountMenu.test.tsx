import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import StudentAccountMenu from './StudentAccountMenu';
function Location() {
  return <output aria-label="Current page">{useLocation().pathname}</output>;
}
function open(
  signOut = vi.fn(async () => {}),
  name: string | undefined = 'Example Student',
) {
  const view = render(
    <MemoryRouter initialEntries={['/student']}>
      <StudentAccountMenu
        name={name}
        email="student@example.com"
        signOut={signOut}
      />
      <button>Outside control</button>
      <Location />
    </MemoryRouter>,
  );
  return {
    ...view,
    signOut,
    user: userEvent.setup(),
    trigger: screen.getByRole('button', { name: /^Account menu for/ }),
  };
}
it('shows a compact account trigger, opens the summary and only working actions', async () => {
  const { user, trigger } = open();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Sign out' }),
  ).not.toBeInTheDocument();
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('menu', { name: 'Student account' })).toBeVisible();
  expect(screen.getByText('Student', { exact: true })).toBeVisible();
  expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveFocus();
  expect(screen.queryByText('Password & security')).not.toBeInTheDocument();
});
it('supports arrows, Home, End, Escape and focus return', async () => {
  const { user, trigger } = open();
  trigger.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveFocus();
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveFocus();
  await user.keyboard('{End}');
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  await user.keyboard('{Home}');
  expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
});
it('closes with Tab, outside pointer events and focus moving outside', async () => {
  const { user, trigger } = open();
  await user.click(trigger);
  await user.tab();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(trigger);
  act(() => screen.getByRole('button', { name: 'Outside control' }).focus());
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
it('navigates to the existing profile page and closes the popup', async () => {
  const { user, trigger } = open();
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'My profile' }));
  expect(screen.getByLabelText('Current page')).toHaveTextContent(
    '/student/profile',
  );
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
it('prevents repeated logout submissions and handles a safe retryable error', async () => {
  let reject!: (reason: unknown) => void;
  const signOut = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const { user, trigger } = open(signOut);
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(trigger).toBeDisabled();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.click(trigger);
  expect(signOut).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('private provider failure')));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to sign out',
  );
  expect(trigger).toBeEnabled();
  expect(trigger).toHaveFocus();
  expect(
    screen.queryByText('private provider failure'),
  ).not.toBeInTheDocument();
});
it('uses an account fallback before the profile loads and cleans up its portal on unmount', async () => {
  const { user, trigger, unmount } = open(undefined, '');
  expect(trigger).toHaveAccessibleName('Account menu for Student account');
  await user.click(trigger);
  expect(screen.getByRole('menu')).toBeVisible();
  unmount();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
