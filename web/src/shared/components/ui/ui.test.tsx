import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Button from './Button';
import Input from './Input';

it('supports input focus and native events, and prevents accidental form submission', async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLInputElement>();
  const onSubmit = vi.fn((event) => event.preventDefault());
  const onChange = vi.fn();
  render(
    <form onSubmit={onSubmit}>
      <label htmlFor="shared-input">Name</label>
      <Input ref={ref} id="shared-input" onChange={onChange} />
      <Button onClick={() => ref.current?.focus()}>Focus field</Button>
      <Button disabled>Unavailable action</Button>
    </form>,
  );
  await user.click(screen.getByRole('button', { name: 'Focus field' }));
  expect(screen.getByLabelText('Name')).toHaveFocus();
  await user.type(screen.getByLabelText('Name'), 'Sam');
  expect(onChange).toHaveBeenCalled();
  expect(screen.getByLabelText('Name')).toHaveValue('Sam');
  await user.click(screen.getByRole('button', { name: 'Unavailable action' }));
  expect(onSubmit).not.toHaveBeenCalled();
});
