import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FacultySelect from './FacultySelect';
import { activeFaculties } from '../api/faculties.api';
import { faculty } from '../../../test/fixtures/faculties';
vi.mock('../api/faculties.api', () => ({ activeFaculties: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(activeFaculties).mockResolvedValue([faculty]);
});
it('selects a catalogue name and retains an existing legacy faculty', async () => {
  const change = vi.fn();
  render(
    <FacultySelect
      uid="a"
      value="Legacy"
      preservedValue="Legacy"
      onChange={change}
    />,
  );
  await screen.findByRole('option', { name: 'Science' });
  expect(screen.getByLabelText('Faculty')).toHaveValue('Legacy');
  await userEvent.selectOptions(screen.getByLabelText('Faculty'), 'Science');
  expect(change).toHaveBeenCalledWith('Science');
});
it('retries a failed catalogue request and handles an empty catalogue', async () => {
  vi.mocked(activeFaculties)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce([]);
  render(<FacultySelect uid="a" value="" onChange={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Faculty')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry faculties' }),
  );
  expect(await screen.findByText(/No active faculties/)).toBeVisible();
});
it('aborts catalogue requests on unmount', () => {
  vi.mocked(activeFaculties).mockImplementation(() => new Promise(() => {}));
  const view = render(<FacultySelect uid="a" value="" onChange={vi.fn()} />);
  const signal = vi.mocked(activeFaculties).mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
});
