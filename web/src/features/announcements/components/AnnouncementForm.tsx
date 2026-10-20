import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import {
  announcementAccessError,
  announcementError,
  publicationValidation,
  publishAnnouncement,
} from '../api/announcements.api';
import type {
  AnnouncementError,
  PublicationInput,
} from '../api/announcements.api';

export default function AnnouncementForm({
  uid,
  userID,
  basePath,
  onAccessError,
}: {
  uid: string;
  userID: string;
  basePath: string;
  onAccessError: (error: AnnouncementError) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [payload, setPayload] = useState<PublicationInput>();
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const finished = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const dirty = Boolean(title || content || payload || pending);
  const blocker = useBlocker(
    () => !finished.current && (dirty || busy.current),
  );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    if (dirty) window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  useEffect(() => {
    if (payload) confirmation.current?.focus();
  }, [payload]);
  function review() {
    if (busy.current || payload) return;
    const invalid = publicationValidation(title, content);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      setPayload({
        request_id: crypto.randomUUID(),
        title: title.trim(),
        content: content.trim(),
        audience: 'all_students',
      });
      setError('');
    } catch {
      setError('Unable to prepare publication. Your text has been kept.');
    }
  }
  async function publish() {
    if (busy.current || !payload) return;
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const saved = await publishAnnouncement(
        payload,
        uid,
        userID,
        request.signal,
      );
      if (request.signal.aborted) return;
      finished.current = true;
      navigate(`${basePath}/${saved.announcement.announcement_id}`, {
        replace: true,
        state: { announcementPublished: true },
      });
    } catch (reason) {
      if (request.signal.aborted) return;
      const failure = announcementError(reason);
      if (announcementAccessError(failure)) {
        onAccessError(failure);
        return;
      }
      if (failure.kind === 'unavailable') {
        setUncertain(true);
        setError(
          'Publication could not be confirmed and may already be saved. Retry the identical publication or check announcements before creating another. Your original reference and text are preserved.',
        );
      } else {
        setPayload(undefined);
        setUncertain(false);
        setError(failure.message);
      }
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <section
      className="announcement-card"
      aria-labelledby="announcement-form-title"
    >
      <Link to={basePath}>Back to announcements</Link>
      <h2 id="announcement-form-title">Publish announcement</h2>
      <p>
        This publishes immediately to all students. Announcements cannot be
        edited, deleted or unpublished. To correct one, publish a new
        announcement.
      </p>
      <form
        className="announcement-form"
        noValidate
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (payload) void publish();
          else review();
        }}
      >
        <label>
          Title
          <input
            value={title}
            disabled={Boolean(payload) || pending}
            required
            aria-describedby="announcement-title-help announcement-publish-error"
            onChange={(event) => {
              setTitle(event.target.value);
              setError('');
            }}
          />
        </label>
        <p id="announcement-title-help" className="announcement-caption">
          {Array.from(title.trim()).length}/160 characters. Use a single line.
        </p>
        <label>
          Content
          <textarea
            value={content}
            rows={8}
            disabled={Boolean(payload) || pending}
            required
            aria-describedby="announcement-content-help announcement-publish-error"
            onChange={(event) => {
              setContent(event.target.value);
              setError('');
            }}
          />
        </label>
        <p id="announcement-content-help" className="announcement-caption">
          {Array.from(content.trim()).length}/5000 characters. Plain text only;
          line breaks are preserved.
        </p>
        <p
          id="announcement-publish-error"
          ref={alert}
          tabIndex={-1}
          role={error ? 'alert' : undefined}
        >
          {error}
        </p>
        {payload && (
          <div
            ref={confirmation}
            tabIndex={-1}
            role="region"
            aria-label="Review announcement"
            className="announcement-review"
          >
            <h3>
              {uncertain
                ? 'Original publication for identical retry'
                : 'Review before publishing'}
            </h3>
            <p>Audience: all students · Publication: immediate</p>
            <h4>{payload.title}</h4>
            <p className="announcement-prose">{payload.content}</p>
          </div>
        )}
        <div className="announcement-toolbar">
          {payload ? (
            <>
              <Button size="sm" type="submit" disabled={pending}>
                {pending
                  ? 'Publishing…'
                  : uncertain
                    ? 'Retry identical publication'
                    : 'Publish to all students'}
              </Button>
              {!uncertain && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setPayload(undefined)}
                >
                  Edit draft
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" type="submit">
              Review announcement
            </Button>
          )}
          <Link to={basePath}>View announcements</Link>
        </div>
      </form>
      {blocker.state === 'blocked' && (
        <div className="announcement-review" role="alert">
          <p>
            {pending
              ? 'Wait for publication to finish before leaving.'
              : uncertain
                ? 'Leave an unconfirmed publication? It may already be saved. Leaving loses the exact retry details; check existing announcements before publishing another.'
                : 'Discard this announcement draft and leave?'}
          </p>
          <div className="announcement-toolbar">
            <Button size="sm" onClick={() => blocker.reset()}>
              Stay here
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => {
                finished.current = true;
                blocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
