import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LiveAttendance from './LiveAttendance';
import { startAttendanceLive } from '../api/attendance-live';
import type { LiveCallbacks } from '../api/attendance-live';
import {
  liveProjection,
  publicationStatus,
} from '../../../test/fixtures/attendanceRealtime';
vi.mock('../api/attendance-live', () => ({ startAttendanceLive: vi.fn() }));
const stop = vi.fn();
let handlers: LiveCallbacks;
const onUpdate = vi.fn();
const denied = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.mocked(startAttendanceLive).mockImplementation((_uid, callbacks) => {
    handlers = callbacks;
    return stop;
  });
});
afterEach(() => vi.restoreAllMocks());
function open() {
  return render(
    <LiveAttendance uid="uid" onUpdate={onUpdate} denied={denied} />,
  );
}
function enable() {
  fireEvent.click(screen.getByRole('button', { name: 'Enable live updates' }));
}
it('starts only after deliberate activation and exposes a keyboard-accessible toggle', () => {
  open();
  expect(startAttendanceLive).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: 'Enable live updates' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  button.focus();
  expect(button).toHaveFocus();
  enable();
  expect(startAttendanceLive).toHaveBeenCalledWith(
    'uid',
    expect.objectContaining({ invalidate: onUpdate, denied }),
  );
  expect(
    screen.getByRole('button', { name: 'Turn off live updates' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Connecting');
});
it('shows publication time, delay and pending access synchronization honestly', () => {
  open();
  enable();
  const projection = liveProjection();
  act(() =>
    handlers.state({
      phase: 'stale',
      projection,
      publication: { ...publicationStatus(), pending: true, pending_grants: 2 },
    }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('90 seconds');
  expect(
    screen.getByText(/Last published/).querySelector('time'),
  ).toHaveAttribute(
    'dateTime',
    new Date(projection.published_at).toISOString(),
  );
  expect(screen.getByText(/waiting to be delivered/)).toBeVisible();
  expect(screen.getByText(/access synchronization is pending/)).toBeVisible();
});
it.each(['disabled', 'unavailable', 'stale'] as const)(
  'allows explicit reconnect from %s',
  (phase) => {
    open();
    enable();
    act(() => handlers.state({ phase }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconnect live updates' }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(startAttendanceLive).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  },
);
it('displays a safe failure message and turns off without losing the manual-refresh explanation', () => {
  open();
  enable();
  act(() =>
    handlers.state({
      phase: 'unavailable',
      message: 'Please refresh manually.',
    }),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Please refresh manually.',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Turn off live updates' }),
  );
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText(/Live updates are off/)).toBeVisible();
});
it('pauses while hidden, clears feed metadata, and gets a fresh grant when visible', () => {
  open();
  enable();
  act(() => handlers.state({ phase: 'live', projection: liveProjection() }));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('paused');
  expect(screen.queryByText(/Last published/)).not.toBeInTheDocument();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(startAttendanceLive).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status')).toHaveTextContent('Connecting');
});
it('pauses offline and reconnects online with one lifecycle', () => {
  open();
  enable();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  fireEvent(window, new Event('offline'));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('paused');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  fireEvent(window, new Event('online'));
  expect(startAttendanceLive).toHaveBeenCalledTimes(2);
});
it('does not connect when activated offline and removes activity listeners on unmount', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  const view = open();
  enable();
  expect(startAttendanceLive).not.toHaveBeenCalled();
  view.unmount();
  expect(removeDocument).toHaveBeenCalledWith(
    'visibilitychange',
    expect.any(Function),
  );
  expect(removeWindow).toHaveBeenCalledWith('offline', expect.any(Function));
  expect(removeWindow).toHaveBeenCalledWith('online', expect.any(Function));
});
it('stops live activity when navigating away', () => {
  const view = open();
  enable();
  view.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});
