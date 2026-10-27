import type {
  InboxNotification,
  NotificationPage,
} from '../../features/notifications/api/notifications.api';
export const notificationFixture: InboxNotification = {
  notification_id: '11111111-1111-4111-8111-111111111111',
  source_type: 'complaint',
  complaint_id: '22222222-2222-4222-8222-222222222222',
  kind: 'status',
  category: 'maintenance',
  status: 'in_progress',
  title: 'Your complaint is in progress',
  occurred_at: '2026-10-20T08:00:00Z',
  created_at: '2026-10-20T08:01:00Z',
  read_at: null,
};
export const readNotification = {
  ...notificationFixture,
  read_at: '2026-10-20T09:00:00Z',
};
export function notificationPage(
  items: InboxNotification[] = [notificationFixture],
  offset = 0,
  total = items.length,
): NotificationPage {
  return {
    items,
    total,
    offset,
    limit: 20,
    has_more: offset + items.length < total,
  };
}
