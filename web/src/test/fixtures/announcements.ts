import type {
  Announcement,
  AnnouncementPage,
  DeliverySummary,
  PublicationInput,
} from '../../features/announcements/api/announcements.api';
export const announcementFixture: Announcement = {
  announcement_id: '11111111-1111-4111-8111-111111111111',
  title: 'Common room maintenance',
  content:
    'The common room will be closed on Friday.\nPlease use the study area.',
  audience: 'all_students',
  priority: 'normal',
  published_by: '22222222-2222-4222-8222-222222222222',
  published_at: '2026-10-20T14:00:00+05:30',
};
export const publicationFixture: PublicationInput = {
  request_id: '33333333-3333-4333-8333-333333333333',
  title: announcementFixture.title,
  content: announcementFixture.content,
  audience: 'all_students',
};
export const announcementPage = (
  items: Announcement[] = [announcementFixture],
  offset = 0,
  total = items.length,
): AnnouncementPage => ({
  items,
  offset,
  total,
  limit: 20,
  has_more: offset + items.length < total,
});
export const summaryFixture: DeliverySummary = {
  announcement_id: announcementFixture.announcement_id,
  recipients_total: 10,
  delivered: 8,
  pending_delivery: 2,
  read: 3,
  unread: 5,
};
