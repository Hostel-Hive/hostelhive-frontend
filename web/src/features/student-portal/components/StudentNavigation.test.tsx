import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import StudentNavigation from './StudentNavigation';

it('groups student routes and marks nested complaint routes active', () => {
  render(
    <MemoryRouter initialEntries={['/student/complaints/example']}>
      <StudentNavigation />
    </MemoryRouter>,
  );
  const nav = within(
    screen.getByRole('navigation', { name: 'Student navigation' }),
  );
  expect(nav.getAllByRole('link')).toHaveLength(11);
  expect(nav.getByRole('link', { name: 'Going Home' })).toHaveAttribute(
    'href',
    '/student/going-home',
  );
  expect(
    within(nav.getByRole('list', { name: 'My account navigation' })).getByRole(
      'link',
      { name: 'My profile' },
    ),
  ).toHaveAttribute('href', '/student/profile');
  expect(nav.getByRole('link', { name: 'Complaints' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(nav.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
    'aria-current',
  );
  expect(
    nav.queryByRole('link', { name: 'User management' }),
  ).not.toBeInTheDocument();
});

it('opens using the keyboard and closes on Escape with focus restored', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StudentNavigation />
    </MemoryRouter>,
  );
  const toggle = screen.getByRole('button', {
    name: 'Open student navigation',
  });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.tab();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(
    document.getElementById(toggle.getAttribute('aria-controls')!),
  ).toHaveAttribute('aria-label', 'Student navigation');
  await user.tab();
  await user.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
});

it('closes the mobile menu after selecting a destination', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <StudentNavigation />
    </MemoryRouter>,
  );
  const toggle = screen.getByRole('button', {
    name: 'Open student navigation',
  });
  await user.click(toggle);
  await user.click(screen.getByRole('link', { name: 'Accommodation' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('link', { name: 'Accommodation' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
