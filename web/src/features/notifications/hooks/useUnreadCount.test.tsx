import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useUnreadCount, { refreshUnreadCount } from './useUnreadCount';
import { getUnreadCount } from '../api/notifications.api';
vi.mock('../api/notifications.api', async (original) => ({
  ...(await original<typeof import('../api/notifications.api')>()),
  getUnreadCount: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getUnreadCount).mockResolvedValue(3);
});
afterEach(() => vi.useRealTimers());
it('refreshes counts only for the matching account and aborts obsolete requests', async () => {
  const { result, unmount } = renderHook(() =>
    useUnreadCount('uid', 'student'),
  );
  await waitFor(() => expect(result.current.count).toBe(3));
  act(() => refreshUnreadCount('other'));
  expect(getUnreadCount).toHaveBeenCalledTimes(1);
  act(() => refreshUnreadCount('uid'));
  await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(2));
  expect(vi.mocked(getUnreadCount).mock.calls[0][1].aborted).toBe(true);
  const signal = vi.mocked(getUnreadCount).mock.calls[1][1];
  unmount();
  expect(signal.aborted).toBe(true);
});
it('refreshes once per minute while visible and on focus, and removes listeners', async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() =>
    useUnreadCount('uid', 'student'),
  );
  await act(async () => {});
  expect(result.current.count).toBe(3);
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(getUnreadCount).toHaveBeenCalledTimes(2);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(getUnreadCount).toHaveBeenCalledTimes(3);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(getUnreadCount).toHaveBeenCalledTimes(4);
  unmount();
  window.dispatchEvent(new Event('focus'));
  refreshUnreadCount('uid');
  await vi.advanceTimersByTimeAsync(60000);
  expect(getUnreadCount).toHaveBeenCalledTimes(4);
});
it('skips hidden-window polling and refreshes on returning', async () => {
  vi.useFakeTimers();
  const spy = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  const { unmount } = renderHook(() => useUnreadCount('uid', 'student'));
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(getUnreadCount).toHaveBeenCalledTimes(1);
  spy.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(getUnreadCount).toHaveBeenCalledTimes(2);
  unmount();
  spy.mockRestore();
});
it('never leaks a delayed count across UID or role changes', async () => {
  let finish!: (n: number) => void;
  vi.mocked(getUnreadCount).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ uid, role }) => useUnreadCount(uid, role),
    { initialProps: { uid: 'uid', role: 'student' } },
  );
  rerender({ uid: 'other', role: 'warden' });
  await waitFor(() => expect(result.current.count).toBe(3));
  await act(async () => finish(99));
  expect(result.current.count).toBe(3);
});
it('does not request without a UID', () => {
  renderHook(() => useUnreadCount('', 'student'));
  expect(getUnreadCount).not.toHaveBeenCalled();
});
