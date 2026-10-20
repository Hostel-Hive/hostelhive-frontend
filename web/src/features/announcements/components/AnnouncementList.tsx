import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { listAnnouncements } from '../api/announcements.api';
import type { AnnouncementError } from '../api/announcements.api';
import useAnnouncementRequest from '../hooks/useAnnouncementRequest';
import AnnouncementState from './AnnouncementState';
import '../../../styles/announcements.css';
export interface AnnouncementReaderProps {
  uid: string;
  staff?: boolean;
  basePath: string;
  onAccessError: (error: AnnouncementError) => void;
}
export function AnnouncementDate({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))}
    </time>
  );
}
export default function AnnouncementList({
  uid,
  staff = false,
  basePath,
  onAccessError,
}: AnnouncementReaderProps) {
  const [offset, setOffset] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => listAnnouncements(uid, signal, offset),
    [uid, offset],
  );
  const request = useAnnouncementRequest(
    `${uid}:${offset}`,
    load,
    onAccessError,
  );
  const result = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (!request.pending && focusNext.current) {
      focusNext.current = false;
      result.current?.focus();
    }
  }, [request.pending]);
  function navigate(next: number) {
    if (request.pending) return;
    focusNext.current = true;
    if (next === offset) request.retry();
    else setOffset(next);
  }
  return (
    <section
      className="announcement-card"
      aria-labelledby="announcement-list-title"
    >
      <div className="announcement-toolbar">
        <h2 id="announcement-list-title">Latest announcements</h2>
        {staff && (
          <Link className="button-link" to={`${basePath}/new`}>
            New announcement
          </Link>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={() => navigate(0)}
        >
          Refresh announcements
        </Button>
      </div>
      <p>
        Published notices for all students. Opening an announcement does not
        mark an inbox notification as read.
      </p>
      <div
        ref={result}
        tabIndex={-1}
        aria-label="Announcement results"
        role="region"
        aria-busy={request.pending}
      >
        {!request.data ? (
          <AnnouncementState error={request.error} retry={request.retry} />
        ) : (
          <>
            <p role="status">
              {request.data.total} announcement
              {request.data.total === 1 ? '' : 's'}.
              {request.data.items.length > 0 &&
                ` Showing ${request.data.offset + 1}–${request.data.offset + request.data.items.length}.`}
            </p>
            {request.data.items.length ? (
              <ul className="announcement-feed">
                {request.data.items.map((row) => (
                  <li key={row.announcement_id}>
                    <h3>
                      <Link to={`${basePath}/${row.announcement_id}`}>
                        {row.title}
                      </Link>
                    </h3>
                    <p className="announcement-caption">
                      Published <AnnouncementDate value={row.published_at} />
                    </p>
                    <p className="announcement-preview">{row.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {offset
                  ? 'No announcements on this page. Use Previous or refresh.'
                  : 'No announcements have been published yet.'}
              </p>
            )}
            <nav
              className="announcement-pagination"
              aria-label="Announcement pages"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={!offset}
                onClick={() => navigate(Math.max(0, offset - 20))}
              >
                Previous
              </Button>
              <span>Page {Math.floor(offset / 20) + 1}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !request.data.has_more ||
                  offset > Number.MAX_SAFE_INTEGER - 40
                }
                onClick={() => navigate(offset + 20)}
              >
                Next
              </Button>
            </nav>
          </>
        )}
      </div>
      <p className="announcement-caption">
        Newest publication first. Times use your device timezone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Refresh returns to
        page 1.
      </p>
    </section>
  );
}
