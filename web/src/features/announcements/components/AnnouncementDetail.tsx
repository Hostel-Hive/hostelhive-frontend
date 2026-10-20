import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import {
  getAnnouncement,
  getAnnouncementSummary,
} from '../api/announcements.api';
import useAnnouncementRequest from '../hooks/useAnnouncementRequest';
import AnnouncementState from './AnnouncementState';
import { AnnouncementDate } from './AnnouncementList';
import type { AnnouncementReaderProps } from './AnnouncementList';
export default function AnnouncementDetail({
  uid,
  staff = false,
  basePath,
  onAccessError,
}: AnnouncementReaderProps) {
  const { announcementID = '' } = useParams();
  const load = useCallback(
    (signal: AbortSignal) => getAnnouncement(announcementID, uid, signal),
    [announcementID, uid],
  );
  const request = useAnnouncementRequest(
    `${uid}:${announcementID}`,
    load,
    onAccessError,
  );
  const location = useLocation();
  return (
    <div className="announcement-stack">
      <article
        className="announcement-card"
        aria-labelledby="announcement-detail-title"
      >
        <Link to={basePath}>Back to announcements</Link>
        <h2 id="announcement-detail-title">
          {request.data?.title ?? 'Announcement details'}
        </h2>
        {location.state?.announcementPublished && (
          <p role="status">
            Announcement published. Inbox delivery is processed in the
            background.
          </p>
        )}
        {!request.data ? (
          <AnnouncementState error={request.error} retry={request.retry} />
        ) : (
          <>
            <p className="announcement-caption">
              Published <AnnouncementDate value={request.data.published_at} /> ·
              All students
            </p>
            <div className="announcement-prose">{request.data.content}</div>
            <div className="announcement-toolbar">
              <Button size="sm" variant="secondary" onClick={request.retry}>
                Refresh announcement
              </Button>
            </div>
            <p className="announcement-caption">
              Times use your device timezone. Published announcements cannot be
              edited or deleted.
            </p>
          </>
        )}
      </article>
      {staff && request.data && (
        <DeliverySummaryCard
          key={`${uid}:${announcementID}`}
          uid={uid}
          basePath={basePath}
          onAccessError={onAccessError}
        />
      )}
    </div>
  );
}
function DeliverySummaryCard({ uid, onAccessError }: AnnouncementReaderProps) {
  const { announcementID = '' } = useParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      getAnnouncementSummary(announcementID, uid, signal),
    [announcementID, uid],
  );
  const request = useAnnouncementRequest(
    `${uid}:${announcementID}`,
    load,
    onAccessError,
  );
  return (
    <section
      className="announcement-card"
      aria-labelledby="announcement-delivery-title"
    >
      <div className="announcement-toolbar">
        <h2 id="announcement-delivery-title">Delivery summary</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={request.retry}
        >
          Refresh delivery summary
        </Button>
      </div>
      {!request.data ? (
        <AnnouncementState error={request.error} retry={request.retry} />
      ) : (
        <dl className="announcement-counts">
          {[
            ['Original recipients', request.data.recipients_total],
            ['Delivered to inbox', request.data.delivered],
            ['Pending delivery', request.data.pending_delivery],
            ['Read', request.data.read],
            ['Unread', request.data.unread],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="announcement-caption">
        Counts refer to the original recipient snapshot. Inbox delivery may lag
        publication. Read counts do not prove comprehension or email/phone
        receipt.
      </p>
    </section>
  );
}
