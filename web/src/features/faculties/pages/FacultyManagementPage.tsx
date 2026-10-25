import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import useAuth from '../../auth/hooks/useAuth';
import {
  facultyAccessDenied,
  listFaculties,
  type Faculty,
  type FacultyAction,
  type FacultyFilter,
  type FacultyPage,
} from '../api/faculties.api';
import FacultyDialog from '../components/FacultyDialog';
import '../../../styles/faculties.css';
export default function FacultyManagementPage() {
  const { account } = useAuth();
  if (!account || !['admin', 'warden'].includes(account.role))
    return (
      <p role="alert">
        Faculty access is available to administrators and wardens only.
      </p>
    );
  return (
    <FacultyDirectory
      key={`${account.firebase_uid}:${account.role}`}
      uid={account.firebase_uid}
      editable={account.role === 'admin'}
    />
  );
}
function FacultyDirectory({
  uid,
  editable,
}: {
  uid: string;
  editable: boolean;
}) {
  const [filter, setFilter] = useState<FacultyFilter>('all');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    page?: FacultyPage;
    error?: string;
  }>();
  const [denied, setDenied] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{
    action: FacultyAction;
    faculty?: Faculty;
  }>();
  const key = `${filter}:${offset}:${revision}`;
  const current = response?.key === key ? response : undefined;
  const page = !denied ? current?.page : undefined;
  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    void listFaculties(uid, controller.signal, filter, offset)
      .then((page) => {
        if (!controller.signal.aborted) setResponse({ key, page });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (facultyAccessDenied(error)) {
          setDenied(error instanceof Error ? error.message : 'Access denied.');
          setEditor(undefined);
          setResponse(undefined);
        } else
          setResponse({
            key,
            error: 'Unable to load faculties. Please try again.',
          });
      });
    return () => controller.abort();
  }, [uid, filter, offset, revision, key, denied]);
  const refresh = () => setRevision((v) => v + 1);
  return (
    <section className="faculties-page" aria-labelledby="faculties-title">
      <p className="eyebrow">System / Faculties</p>
      <h1 id="faculties-title">Faculty management</h1>
      <p className="page-description">
        Maintain the faculty catalogue for student records and announcements.
      </p>
      <div className="faculties-panel">
        <div className="faculties-toolbar">
          <div className="faculties-heading">
            <span className="faculty-icon">
              <NavigationIcon name="faculty" />
            </span>
            <div>
              <h2>Faculty directory</h2>
              <p>
                {editable
                  ? 'Manage faculty names and availability.'
                  : 'View faculties. Only administrators can make changes.'}
              </p>
            </div>
          </div>
          <div className="faculty-actions">
            <Button
              variant="secondary"
              disabled={!!editor || !!denied}
              onClick={refresh}
            >
              Refresh faculties
            </Button>
            {editable && (
              <Button
                disabled={!!editor || !page}
                onClick={() => {
                  setNotice('');
                  setEditor({ action: 'create' });
                }}
              >
                ＋ Add faculty
              </Button>
            )}
          </div>
        </div>
        {denied ? (
          <p role="alert" className="faculty-error">
            {denied}
          </p>
        ) : (
          <>
            <div className="faculty-filters">
              <label>
                Status
                <select
                  className="ui-input"
                  value={filter}
                  disabled={!!editor}
                  onChange={(event) => {
                    setFilter(event.target.value as FacultyFilter);
                    setOffset(0);
                    setNotice('');
                  }}
                >
                  <option value="all">All faculties</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
              <p>Inactive faculties remain in existing student records.</p>
            </div>
            {notice && (
              <p role="status" className="faculty-notice">
                {notice}
              </p>
            )}
            {current?.error ? (
              <div role="alert" className="faculty-error">
                <p>{current.error}</p>
                <Button variant="secondary" onClick={refresh}>
                  Retry faculties
                </Button>
              </div>
            ) : !page ? (
              <p role="status" className="faculty-empty">
                Loading faculties…
              </p>
            ) : (
              <>
                {page.items.length ? (
                  <div
                    className="faculty-table-wrap"
                    role="region"
                    aria-label="Faculty directory"
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        {page.items.length}{' '}
                        {page.items.length === 1 ? 'faculty' : 'faculties'} on
                        this page
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Faculty name</th>
                          <th scope="col">Status</th>
                          <th scope="col">Last updated</th>
                          {editable && <th scope="col">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {page.items.map((faculty) => (
                          <tr key={faculty.faculty_id}>
                            <th scope="row">{faculty.name}</th>
                            <td>
                              <span
                                className={`faculty-badge ${faculty.is_active ? 'faculty-badge-active' : ''}`}
                              >
                                {faculty.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <time dateTime={faculty.updated_at}>
                                {new Date(faculty.updated_at).toLocaleString()}
                              </time>
                            </td>
                            {editable && (
                              <td>
                                <div className="faculty-actions">
                                  <Button
                                    variant="secondary"
                                    aria-label={`Rename ${faculty.name}`}
                                    size="sm"
                                    onClick={() => {
                                      setNotice('');
                                      setEditor({ action: 'rename', faculty });
                                    }}
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    variant={
                                      faculty.is_active ? 'ghost' : 'secondary'
                                    }
                                    aria-label={`${faculty.is_active ? 'Deactivate' : 'Activate'} ${faculty.name}`}
                                    size="sm"
                                    onClick={() => {
                                      setNotice('');
                                      setEditor({
                                        action: faculty.is_active
                                          ? 'deactivate'
                                          : 'activate',
                                        faculty,
                                      });
                                    }}
                                  >
                                    {faculty.is_active
                                      ? 'Deactivate'
                                      : 'Activate'}
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="faculty-empty">
                    <h3>No faculties found</h3>
                    <p>
                      {filter === 'all'
                        ? 'No faculties have been added to the catalogue yet.'
                        : 'Choose another status to view faculties.'}
                    </p>
                  </div>
                )}
                <div className="faculty-pagination">
                  <Button
                    variant="secondary"
                    disabled={!offset || !!editor}
                    onClick={() => setOffset((v) => Math.max(0, v - 20))}
                  >
                    Previous
                  </Button>
                  <span>Page {offset / 20 + 1}</span>
                  <Button
                    variant="secondary"
                    disabled={!page.has_more || offset >= 100000 || !!editor}
                    onClick={() => setOffset((v) => v + 20)}
                  >
                    Next
                  </Button>
                </div>
                <p className="faculty-caption">
                  Updated times use your device timezone.
                </p>
              </>
            )}
          </>
        )}
      </div>
      {editable && editor && !denied && (
        <FacultyDialog
          {...editor}
          uid={uid}
          onDenied={(message) => {
            setDenied(message);
            setEditor(undefined);
            setResponse(undefined);
          }}
          onClose={(changed) => {
            setEditor(undefined);
            if (changed) {
              setNotice('Review the current faculty details below.');
              refresh();
            }
          }}
        />
      )}
    </section>
  );
}
