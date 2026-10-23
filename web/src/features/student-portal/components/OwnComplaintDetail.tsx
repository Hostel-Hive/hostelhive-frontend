import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  complaintAccessError,
  getOwnComplaint,
  getOwnComplaintHistory,
  ownComplaintError,
} from '../api/own-complaints.api';
import type { OwnComplaintError } from '../api/own-complaints.api';
import type {
  Complaint,
  ComplaintPage,
  ComplaintUpdate,
} from '../../complaints/complaints.types';
import { statusLabel } from '../../complaints/api/complaints.api';
import ComplaintDate from '../../complaints/components/ComplaintDate';
import OwnComplaintForm from './OwnComplaintForm';
import type { OwnComplaintProps } from './OwnComplaintList';
import ComplaintEvidence from '../../complaints/components/ComplaintEvidence';
import { EvidenceError } from '../../complaints/api/complaint-images.api';
import { StudentPortalError } from '../api/student-portal.api';

const labels = {
  created: 'Complaint submitted',
  note: 'Note added',
  status: 'Status changed',
  image_added: 'Evidence attached',
  image_removed: 'Evidence removed',
};
type Snapshot = { row: Complaint; history: ComplaintPage<ComplaintUpdate> };
export default function OwnComplaintDetail(props: OwnComplaintProps) {
  const { complaintID = '' } = useParams();
  return (
    <Detail
      key={`${props.uid}:${props.studentID}:${complaintID}`}
      {...props}
      id={complaintID}
    />
  );
}
function Detail({
  uid,
  studentID,
  onAccessError,
  id,
}: OwnComplaintProps & { id: string }) {
  const location = useLocation();
  const [query, setQuery] = useState({ offset: 0, attempt: 0 });
  const [result, setResult] = useState<{
    query: typeof query;
    data?: Snapshot;
    error?: OwnComplaintError;
  }>();
  const [noteOpen, setNoteOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [evidenceLocked, setEvidenceLocked] = useState(false);
  const evidenceDenied = useCallback(
    (error: EvidenceError) => {
      if (
        error.kind === 'session' ||
        error.kind === 'forbidden' ||
        error.kind === 'setup'
      )
        onAccessError(new StudentPortalError(error.kind, error.message));
    },
    [onAccessError],
  );
  const reviewEvidence = useCallback(
    async (signal: AbortSignal) => {
      try {
        const row = await getOwnComplaint(id, uid, studentID, signal);
        const history = await getOwnComplaintHistory(
          row,
          uid,
          studentID,
          signal,
        );
        if (!signal.aborted) setResult({ query, data: { row, history } });
      } catch (reason) {
        const error = ownComplaintError(reason);
        throw new EvidenceError(
          error.kind === 'ineligible' ? 'conflict' : error.kind,
          error.message,
        );
      }
    },
    [id, uid, studentID, query],
  );
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const row = await getOwnComplaint(
          id,
          uid,
          studentID,
          controller.signal,
        );
        const history = await getOwnComplaintHistory(
          row,
          uid,
          studentID,
          controller.signal,
          query.offset,
        );
        if (!controller.signal.aborted)
          setResult({ query, data: { row, history } });
      } catch (reason) {
        if (controller.signal.aborted) return;
        const error = ownComplaintError(reason);
        setResult({ query, error });
        const access = complaintAccessError(error);
        if (access) onAccessError(access);
      }
    }
    void load();
    return () => controller.abort();
  }, [uid, studentID, id, query, onAccessError]);
  const current = result?.query === query ? result : undefined;
  const data = current?.data;
  useEffect(() => {
    if (current && query.attempt) summary.current?.focus();
  }, [current, query.attempt]);
  function reload(offset = 0) {
    setQuery((previous) => ({ offset, attempt: previous.attempt + 1 }));
  }
  return (
    <div className="portal-stack portal-complaint-detail">
      <section
        className="portal-card"
        aria-labelledby="own-complaint-detail-title"
      >
        <Link to={routePaths.ownComplaints}>Back to my complaints</Link>
        <h2 id="own-complaint-detail-title">Complaint details</h2>
        {notice && <p role="status">{notice}</p>}
        {location.state?.complaintSubmitted && (
          <p role="status">Complaint submitted successfully.</p>
        )}
        <div ref={summary} tabIndex={-1}>
          {!current && <p role="status">Loading your complaint…</p>}
          {current?.error && (
            <>
              <p role="alert">{current.error.message}</p>
              {!complaintAccessError(current.error) && (
                <Button size="sm" onClick={() => reload(query.offset)}>
                  Retry complaint
                </Button>
              )}
            </>
          )}
          {data && (
            <>
              <p className="portal-complaint-status">
                <span
                  className={`portal-leave-badge portal-leave-badge--${data.row.status}`}
                >
                  {statusLabel(data.row.status)}
                </span>{' '}
                · Version {data.row.version}
              </p>
              <dl className="portal-details">
                <div>
                  <dt>Category</dt>
                  <dd>
                    {data.row.category === 'maintenance'
                      ? 'Maintenance'
                      : 'Disciplinary'}
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>
                    <ComplaintDate value={data.row.created_at} />
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>
                    <ComplaintDate value={data.row.updated_at} />
                  </dd>
                </div>
              </dl>
              <h3>Your description</h3>
              <p className="portal-leave-prose">{data.row.description}</p>
              <div className="portal-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={noteOpen || evidenceLocked}
                  onClick={() => reload()}
                >
                  Refresh complaint
                </Button>
                {!noteOpen && data.row.status !== 'resolved' && (
                  <Button
                    size="sm"
                    disabled={evidenceLocked}
                    onClick={() => setNoteOpen(true)}
                  >
                    Add note
                  </Button>
                )}
              </div>
              {data.row.status === 'resolved' && (
                <p>
                  This complaint is resolved. New notes are unavailable unless
                  staff reopen it.
                </p>
              )}
              <h3>Update history</h3>
              <p className="portal-caption">
                Oldest version first. Times use your device timezone. All notes
                and staff responses are visible here.
              </p>
              {!data.history.items.length ? (
                <p>No updates on this page.</p>
              ) : (
                <ol
                  className="portal-complaint-history"
                  start={data.history.offset + 1}
                >
                  {data.history.items.map((update) => (
                    <li key={update.update_id}>
                      <h4>{labels[update.action]}</h4>
                      <p>
                        Version {update.version} ·{' '}
                        <ComplaintDate value={update.occurred_at} />
                      </p>
                      <p>
                        {update.previous_status
                          ? `${statusLabel(update.previous_status)} → `
                          : ''}
                        {statusLabel(update.new_status)}
                      </p>
                      <p className="portal-leave-prose">
                        {update.text || 'No explanation provided.'}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              <nav
                className="portal-history-pagination"
                aria-label="Complaint history pages"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={noteOpen || evidenceLocked || !data.history.offset}
                  onClick={() => reload(Math.max(0, data.history.offset - 20))}
                >
                  Previous history
                </Button>
                <span>
                  Page {Math.floor(data.history.offset / 20) + 1} ·{' '}
                  {data.history.total} updates
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    noteOpen ||
                    evidenceLocked ||
                    !data.history.has_more ||
                    data.history.offset > Number.MAX_SAFE_INTEGER - 40
                  }
                  onClick={() => reload(data.history.offset + 20)}
                >
                  Next history
                </Button>
              </nav>
            </>
          )}
        </div>
      </section>
      {data && (
        <ComplaintEvidence
          key={`${uid}:${id}`}
          row={data.row}
          uid={uid}
          editable
          disabled={noteOpen}
          onDenied={evidenceDenied}
          onLockChange={setEvidenceLocked}
          onReview={reviewEvidence}
          onChanged={(message) => {
            setNotice(message);
            reload();
          }}
        />
      )}
      {data && noteOpen && (
        <OwnComplaintForm
          uid={uid}
          studentID={studentID}
          onAccessError={onAccessError}
          row={data.row}
          onSaved={() => {
            setNotice('Note saved. Refreshing complaint and history.');
            setNoteOpen(false);
            reload();
          }}
          onReviewed={(row, history) =>
            setResult({ query, data: { row, history } })
          }
        />
      )}
    </div>
  );
}
