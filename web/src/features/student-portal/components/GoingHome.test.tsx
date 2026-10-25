import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import GoingHome from './GoingHome';
import { declareGoingHome, GoingHomeError } from '../api/going-home.api';
import { StudentPortalError } from '../api/student-portal.api';
vi.mock('../api/going-home.api', async (original) => ({
  ...(await original<typeof import('../api/going-home.api')>()),
  declareGoingHome: vi.fn(),
}));
const declare = vi.mocked(declareGoingHome);
const denied = vi.fn();
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  declare.mockResolvedValue({
    going_home_id: id,
    request_id: id,
    student_id: id,
    submitted_by: id,
    status: 'declared',
    declared_at: '2026-10-30T10:00:00Z',
    departed_at: null,
    departure_device_id: null,
    departure_event_id: null,
  });
});
function mount() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <GoingHome uid="student" studentID={id} onAccessError={denied} />
      ),
    },
    { path: '/other', element: <p>Other page</p> },
  ]);
  return {
    ...render(<RouterProvider router={router} />),
    router,
    user: userEvent.setup(),
  };
}
it('requires explicit confirmation and records intent without claiming attendance changed', async () => {
  const { user } = mount();
  expect(
    screen.getByRole('button', { name: 'Confirm Going Home' }),
  ).toBeDisabled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Confirm Going Home' }));
  expect(
    await screen.findByRole('heading', {
      name: 'Going Home declaration recorded',
    }),
  ).toBeVisible();
  expect(screen.getByText(/Complete an exit scan/)).toBeVisible();
  expect(declare).toHaveBeenCalledTimes(1);
});
it('retries an unknown outcome with the identical request ID and warns before leaving', async () => {
  declare.mockRejectedValueOnce(new GoingHomeError(true, 'Unknown result'));
  const { user, router } = mount();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Confirm Going Home' }));
  await screen.findByText('Unknown result');
  await act(async () => {
    await router.navigate('/other');
  });
  expect(
    screen.getByRole('button', { name: 'Stay on this page' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Stay on this page' }));
  await user.click(
    screen.getByRole('button', { name: 'Retry same declaration' }),
  );
  await screen.findByRole('heading', {
    name: 'Going Home declaration recorded',
  });
  expect(declare.mock.calls[0][2]).toBe(declare.mock.calls[1][2]);
});
it('prevents duplicate submissions and aborts on unmount', async () => {
  declare.mockReturnValue(new Promise(() => {}));
  const { user, unmount } = mount();
  await user.click(screen.getByRole('checkbox'));
  await user.dblClick(
    screen.getByRole('button', { name: 'Confirm Going Home' }),
  );
  expect(declare).toHaveBeenCalledTimes(1);
  const signal = declare.mock.calls[0][3];
  unmount();
  expect(signal.aborted).toBe(true);
});
it('propagates session rejection to the student portal', async () => {
  declare.mockRejectedValue(new StudentPortalError('session', 'Sign in again'));
  const { user } = mount();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Confirm Going Home' }));
  await waitFor(() =>
    expect(denied).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'session' }),
    ),
  );
});
