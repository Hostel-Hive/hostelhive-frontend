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
    <div className="announcement-stack announcement-detail-stack">
      <Link className="announcement-back" to={basePath}>
        <span aria-hidden="true">← </span>Back to announcements
      </Link>
      <article
        className="announcement-card announcement-detail-card"
        aria-labelledby="announcement-detail-title"
      >
        <div className="announcement-detail-heading">
          <div>
            {request.data && <p className="eyebrow">Published notice</p>}
            <h2 id="announcement-detail-title">
              {request.data?.title ?? 'Announcement details'}
            </h2>
          </div>
          {request.data && (
            <Button size="sm" variant="secondary" onClick={request.retry}>
              Refresh announcement
            </Button>
          )}
        </div>
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
            <div className="announcement-detail-meta">
              <p className="announcement-caption">
                Published <AnnouncementDate value={request.data.published_at} />
              </p>
              <span className="announcement-audience">All students</span>
            </div>
            <div className="announcement-prose announcement-reading-content">
              {request.data.content}
            </div>
            <div className="announcement-detail-footer">
              <p className="announcement-caption">
                Times use your device timezone. Published announcements cannot
                be edited or deleted.
              </p>
            </div>
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
      className="announcement-card announcement-delivery-card"
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
