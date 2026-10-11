import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import App from './App';

it('renders the HostelHive starter screen given the application is mounted', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'HostelHive', level: 1 }),
  ).toBeVisible();
  expect(screen.getByText('Staff dashboard')).toBeVisible();
});
