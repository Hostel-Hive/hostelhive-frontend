import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import {
  listNotifications,
  markNotificationRead,
  notificationAccessError,
  notificationError,
  notificationSource,
} from '../api/notifications.api';
import type {
  InboxNotification,
  NotificationError,
  NotificationPage,
} from '../api/notifications.api';
import useUnreadCount, { refreshUnreadCount } from '../hooks/useUnreadCount';
import '../../../styles/notifications.css';

export default function NotificationsPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { account } = useAuth();
  if (!account) return null;
  return (
    <section className="notifications-page">
      {!embedded && (
        <>
          <p className="eyebrow">Communication / Inbox</p>
          <h1>Notifications</h1>
        </>
      )}
      <Inbox
        key={`${account.firebase_uid}:${account.role}`}
        uid={account.firebase_uid}
        role={account.role}
      />
    </section>
  );
}
function Inbox({
  uid,
  role,
}: {
  uid: string;
  role: 'admin' | 'warden' | 'student';
}) {
  const { retry: verify, signOut } = useAuth();
  const [denied, setDenied] = useState<NotificationError>();
  const deny = useCallback(
    (error: NotificationError) => {
      setDenied(error);
      refreshUnreadCount(uid);
    },
    [uid],
  );
  return denied ? (
    <div className="notification-card">
      <p role="alert">{denied.message}</p>
      <div className="notification-toolbar">
        <Button
          size="sm"
          onClick={() => void verify().then(() => setDenied(undefined))}
        >
          Verify account access
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign in again
        </Button>
      </div>
    </div>
  ) : (
    <InboxContents uid={uid} role={role} onAccessError={deny} />
  );
}
function Timestamp({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}
    </time>
  );
}
function InboxContents({
  uid,
  role,
  onAccessError,
}: {
  uid: string;
  role: 'admin' | 'warden' | 'student';
  onAccessError: (e: NotificationError) => void;
}) {
  const [unread, setUnread] = useState(false);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: NotificationPage;
    error?: NotificationError;
  }>();
  const [selected, setSelected] = useState<InboxNotification>();
  const [readError, setReadError] = useState<NotificationError>();
  const [busy, setBusy] = useState(false);
  const write = useRef<AbortController | null>(null);
  const detail = useRef<HTMLElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);
  const key = `${uid}:${role}:${unread}:${offset}:${attempt}`;
  const count = useUnreadCount(uid, role, onAccessError);
  useEffect(() => {
    const controller = new AbortController();
    listNotifications(uid, controller.signal, unread, offset)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = notificationError(reason);
        setResult({ key, error });
        if (notificationAccessError(error)) onAccessError(error);
      });
    return () => controller.abort();
  }, [uid, key, unread, offset, onAccessError]);
  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  const current = result?.key === key ? result : undefined;
  const pending = !current;
  useEffect(() => {
    if (!pending && focusResults.current) {
      focusResults.current = false;
      results.current?.focus();
    }
  }, [pending]);
  function refresh() {
    if (write.current) return;
    setSelected(undefined);
    setReadError(undefined);
    setOffset(0);
    setAttempt((n) => n + 1);
    count.refresh();
    focusResults.current = true;
  }
  async function open(row: InboxNotification) {
    if (write.current) return;
    setSelected(row);
    setReadError(undefined);
    if (row.read_at) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true);
    try {
      const updated = await markNotificationRead(
        row.notification_id,
        uid,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // The acknowledgement must still refer to the source the user opened.
      if (
        updated.source_type !== row.source_type ||
        notificationSource(updated, role) !== notificationSource(row, role) ||
        updated.attendance_incident_id !== row.attendance_incident_id
      )
        throw notificationError(null);
      setSelected(updated);
      setOffset(0);
      setAttempt((n) => n + 1);
      refreshUnreadCount(uid);
    } catch (reason) {
      if (controller.signal.aborted) return;
      const error = notificationError(reason);
      setReadError(error);
      if (notificationAccessError(error)) onAccessError(error);
    } finally {
      if (!controller.signal.aborted) {
        write.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="notification-card">
      <div className="notification-toolbar">
        <h2>Your inbox</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || busy}
          onClick={refresh}
        >
          Refresh inbox
        </Button>
      </div>
      <p role="status">
        {count.count === undefined
          ? count.error
            ? 'Unread count unavailable.'
            : 'Checking unread count…'
          : `${count.count} unread notifications.`}
      </p>
      {count.error && (
        <Button size="sm" variant="secondary" onClick={count.refresh}>
          Retry unread count
        </Button>
      )}
      <p>
        Only notifications addressed to your account and within your current
        access appear here. Opening a notification marks it as read; viewing
        this list does not.
      </p>
      <label className="notification-filter">
        <input
          type="checkbox"
          checked={unread}
          disabled={pending || busy}
          onChange={(e) => {
            setUnread(e.target.checked);
            setOffset(0);
            setSelected(undefined);
            setReadError(undefined);
            focusResults.current = true;
          }}
        />
        Unread only
      </label>
      {selected && (
        <section
          className="notification-detail"
          ref={detail}
          tabIndex={-1}
          aria-labelledby="opened-notification-title"
        >
          <h3 id="opened-notification-title">{selected.title}</h3>
          <p>
            Event: {selected.kind.replaceAll('_', ' ')} · Status:{' '}
            {selected.status.replaceAll('_', ' ')}
          </p>
          <p>
            Occurred <Timestamp value={selected.occurred_at} />
          </p>
          {busy ? (
            <p role="status">Marking notification as read…</p>
          ) : selected.read_at ? (
            <p>
              Read <Timestamp value={selected.read_at} />
            </p>
          ) : null}
          {readError && (
            <div>
              <p role="alert">
                {readError.message}{' '}
                {readError.kind === 'unavailable' &&
                  'The read change may already be saved. Retrying the same notification is safe.'}
              </p>
              {readError.kind !== 'not-found' &&
                !notificationAccessError(readError) && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void open(selected)}
                  >
                    Retry marking as read
                  </Button>
                )}
            </div>
          )}
          <div className="notification-toolbar">
            {notificationSource(selected, role) ? (
              <Link to={notificationSource(selected, role)!}>
                View related {selected.source_type.replaceAll('_', ' ')}
              </Link>
            ) : (
              <p>
                Attendance incident details are not available in this portal
                yet.
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSelected(undefined);
                setReadError(undefined);
                results.current?.focus();
              }}
            >
              Close notification
            </Button>
          </div>
          <p className="notification-caption">
            The notification records an event. The related page checks your
            current access and shows the latest resource state; a removed or
            inaccessible resource may no longer open.
          </p>
        </section>
      )}
      <div
        ref={results}
        tabIndex={-1}
        role="region"
        aria-label="Inbox results"
        aria-busy={pending}
      >
        {pending ? (
          <p role="status">Loading notifications…</p>
        ) : current.error ? (
          <div>
            <p role="alert">{current.error.message}</p>
            <Button size="sm" disabled={busy} onClick={refresh}>
              Retry inbox
            </Button>
          </div>
        ) : (
          current.data && (
            <>
              <p role="status">
                {current.data.total} {unread ? 'unread ' : ''}notifications.
                {current.data.items.length > 0 &&
                  ` Showing ${offset + 1}–${offset + current.data.items.length}.`}
              </p>
              {current.data.items.length ? (
                <ul className="notification-list">
                  {current.data.items.map((row) => (
                    <li key={row.notification_id}>
                      <div>
                        <span
                          className={`notification-state${row.read_at ? '' : ' notification-state--unread'}`}
                        >
                          {row.read_at ? 'Read' : 'Unread'}
                        </span>
                        <h3>{row.title}</h3>
                        <p className="notification-caption">
                          {row.source_type.replaceAll('_', ' ')} ·{' '}
                          <Timestamp value={row.occurred_at} />
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void open(row)}
                        aria-label={`Open notification: ${row.title}`}
                      >
                        Open notification
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {offset
                    ? 'No notifications on this page. Use Previous or refresh.'
                    : unread
                      ? 'You have no unread notifications.'
                      : 'Your inbox is empty.'}
                </p>
              )}
              <nav className="notification-toolbar" aria-label="Inbox pages">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!offset || busy}
                  onClick={() => {
                    setOffset((n) => Math.max(0, n - 20));
                    focusResults.current = true;
                  }}
                >
                  Previous
                </Button>
                <span>Page {offset / 20 + 1}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    !current.data.has_more ||
                    busy ||
                    offset > Number.MAX_SAFE_INTEGER - 40
                  }
                  onClick={() => {
                    setOffset((n) => n + 20);
                    focusResults.current = true;
                  }}
                >
                  Next
                </Button>
              </nav>
            </>
          )
        )}
      </div>
      <p className="notification-caption">
        Newest events first. Times use your device timezone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Refresh returns to
        page 1. Unread counts refresh every minute while visible and when you
        return to the window. Notification delivery may take a moment.
      </p>
    </div>
  );
}
