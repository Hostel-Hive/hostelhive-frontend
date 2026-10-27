import { useCallback, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import {
  complaintFilters,
  getComplaint,
  listComplaintUpdates,
  statusLabel,
  type ComplaintError,
  ComplaintError as ComplaintRequestError,
  complaintError,
} from '../api/complaints.api';
import type {
  Complaint,
  ComplaintPage,
  ComplaintUpdate,
} from '../complaints.types';
import useComplaintRequest from '../hooks/useComplaintRequest';
import ComplaintRequestState from '../components/ComplaintRequestState';
import ComplaintDate from '../components/ComplaintDate';
import ComplaintActionDialog from '../components/ComplaintActionDialog';
import ComplaintEvidence from '../components/ComplaintEvidence';
import { EvidenceError } from '../api/complaint-images.api';
type Snapshot = { row: Complaint; history: ComplaintPage<ComplaintUpdate> };
const actionLabels = {
  created: 'Complaint submitted',
  note: 'Note added',
  status: 'Status changed',
  image_added: 'Photo attached',
  image_removed: 'Photo removed',
};
export default function ComplaintDetailPage() {
  const { complaintID = '' } = useParams();
  const { account } = useAuth();
  const uid = account?.firebase_uid ?? '';
  return (
    <ComplaintDetailContent
      key={`${uid}:${complaintID}`}
      id={complaintID}
      uid={uid}
    />
  );
}
function ComplaintDetailContent({ id, uid }: { id: string; uid: string }) {
  const [params] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<'note' | 'status'>();
  const [notice, setNotice] = useState('');
  const [evidenceLocked, setEvidenceLocked] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const key = `${uid}:${id}:${offset}`;
  const load = useCallback(
    async (signal: AbortSignal): Promise<Snapshot> => {
      const [row, history] = await Promise.all([
        getComplaint(id, uid, signal),
        listComplaintUpdates(id, uid, signal, offset),
      ]);
      return { row, history };
    },
    [id, uid, offset],
  );
  const request = useComplaintRequest(key, load);
  const [override, setOverride] = useState<{
    key: string;
    data?: Snapshot;
    error?: ComplaintError;
  }>();
  const current = override?.key === key ? override : undefined;
  const error = current?.error ?? request.error;
  const data = !error ? (current?.data ?? request.data) : undefined;
  const evidenceDenied = useCallback(
    (failure: EvidenceError) => {
      setEditor(undefined);
      setOverride({
        key,
        error: new ComplaintRequestError(
          failure.kind === 'setup' ? 'forbidden' : failure.kind,
          failure.message,
        ),
      });
    },
    [key],
  );
  const reviewEvidence = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [row, history] = await Promise.all([
          getComplaint(id, uid, signal),
          listComplaintUpdates(id, uid, signal, offset),
        ]);
        if (!signal.aborted) setOverride({ key, data: { row, history } });
      } catch (reason) {
        const failure = complaintError(reason);
        throw new EvidenceError(failure.kind, failure.message);
      }
    },
    [id, uid, offset, key],
  );
  let back: string = routePaths.complaints;
  try {
    const q = complaintFilters(params);
    q.delete('limit');
    back += `?${q}`;
  } catch {
    /* Discard unsupported return filters. */
  }
  function refresh() {
    setOverride(undefined);
    setOffset(0);
    request.retry();
  }
  function paginate(next: number) {
    setOverride(undefined);
    setOffset(next);
  }
  return (
    <section
      className="complaint-page complaint-detail-page"
      aria-labelledby="complaint-detail-title"
    >
      <Link className="complaint-back" to={back}>
        <span aria-hidden="true">← </span>Back to complaints
      </Link>
      <p className="eyebrow">Operations / Complaint</p>
      <h1 id="complaint-detail-title" ref={title} tabIndex={-1}>
        Complaint details
      </h1>
      <p className="page-description">
        Review the complaint, supporting evidence and recorded staff updates.
      </p>
      {notice && <p role="status">{notice}</p>}
      {!data || error ? (
        <ComplaintRequestState error={error} retry={refresh} />
      ) : (
        <>
          <div className="complaint-toolbar complaint-detail-toolbar">
            <div className="complaint-detail-status">
              <span
                className={`complaint-badge complaint-badge--${data.row.status}`}
              >
                {statusLabel(data.row.status)}
              </span>
              <span className="complaint-version">
                Version {data.row.version}
              </span>
            </div>
            <div className="complaint-actions">
              <Link
                className="complaint-view-link"
                to={`${routePaths.students}/${data.row.student_id}`}
              >
                View student profile <span aria-hidden="true">→</span>
              </Link>
              <Button
                variant="secondary"
                disabled={evidenceLocked}
                onClick={refresh}
              >
                Refresh complaint
              </Button>
            </div>
          </div>
          <div className="complaint-detail-grid">
            <div className="complaint-detail-main">
              <div className="complaint-card complaint-summary-card">
                <h2>Complaint</h2>
                <div className="complaint-summary-meta">
                  <span className="complaint-category">
                    {data.row.category === 'maintenance'
                      ? 'Maintenance'
                      : 'Disciplinary'}
                  </span>
                </div>
                <dl className="complaint-detail-dates">
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <ComplaintDate value={data.row.created_at} compact />
                    </dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>
                      <ComplaintDate value={data.row.updated_at} compact />
                    </dd>
                  </div>
                </dl>
                <h3 className="complaint-description-title">
                  Original description
                </h3>
                <p className="complaint-prose complaint-description">
                  {data.row.description}
                </p>
                <details className="complaint-references">
                  <summary>Record references</summary>
                  <dl className="complaint-details">
                    <dt>Complaint ID</dt>
                    <dd className="complaint-id">{data.row.complaint_id}</dd>
                    <dt>Student ID</dt>
                    <dd className="complaint-id">{data.row.student_id}</dd>
                    <dt>Submitted by (account ID)</dt>
                    <dd className="complaint-id">{data.row.submitted_by}</dd>
                  </dl>
                </details>
              </div>
              <ComplaintEvidence
                row={data.row}
                uid={uid}
                disabled={Boolean(editor)}
                onDenied={evidenceDenied}
                onLockChange={setEvidenceLocked}
                onReview={reviewEvidence}
                onChanged={(message) => {
                  setNotice(message);
                  refresh();
                }}
              />
            </div>
            <div className="complaint-card complaint-manage-card">
              <h2>Manage complaint</h2>
              <p>
                All notes and explanations are visible to the owning student.
              </p>
              <div className="complaint-actions">
                {data.row.status !== 'resolved' && (
                  <Button onClick={() => setEditor('note')}>Add note</Button>
                )}
                <Button variant="secondary" onClick={() => setEditor('status')}>
                  {data.row.status === 'resolved'
                    ? 'Reopen complaint'
                    : 'Change status'}
                </Button>
              </div>
            </div>
          </div>
          <div className="complaint-card complaint-history-card">
            <h2>Update history</h2>
            <p>
              Oldest version first · Dates include your browser’s local
              timezone.
            </p>
            {data.history.items.length === 0 ? (
              <p role="status">No updates on this page.</p>
            ) : (
              <ol className="complaint-history" start={data.history.offset + 1}>
                {data.history.items.map((update) => (
                  <li key={update.update_id}>
                    <h3>{actionLabels[update.action]}</h3>
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
                    <p className="complaint-prose">
                      {update.text || 'No explanation provided.'}
                    </p>
                    <p className="complaint-id">Actor: {update.actor_id}</p>
                    {update.image_id && (
                      <p className="complaint-id">
                        Photo reference: {update.image_id}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <nav
              className="complaint-pagination"
              aria-label="Complaint history pagination"
            >
              <Button
                variant="secondary"
                disabled={!data.history.offset}
                onClick={() => paginate(Math.max(0, data.history.offset - 20))}
              >
                Previous history
              </Button>
              <span>
                History page {Math.floor(data.history.offset / 20) + 1} ·{' '}
                {data.history.total} updates
              </span>
              <Button
                variant="secondary"
                disabled={
                  !data.history.has_more ||
                  data.history.offset > Number.MAX_SAFE_INTEGER - 40
                }
                onClick={() => paginate(data.history.offset + 20)}
              >
                Next history
              </Button>
            </nav>
          </div>
          {editor && (
            <ComplaintActionDialog
              row={data.row}
              noteOnly={editor === 'note'}
              uid={uid}
              historyOffset={offset}
              onClose={() => setEditor(undefined)}
              onSaved={() => {
                setEditor(undefined);
                setNotice(
                  'Complaint action saved. Refreshing details and history.',
                );
                title.current?.focus();
                refresh();
              }}
              onChecked={(row, history) => {
                setOverride({ key, data: { row, history } });
              }}
              onDenied={(failure) => {
                setEditor(undefined);
                setOverride({ key, error: failure });
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
