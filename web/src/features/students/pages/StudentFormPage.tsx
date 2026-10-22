import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getStudent } from '../api/students.api';
import useAuth from '../../auth/hooks/useAuth';
import useStudentRequest from '../hooks/useStudentRequest';
import StudentRequestState from '../components/StudentRequestState';
import StudentProfileForm from '../components/StudentProfileForm';
import { routePaths } from '../../../app/router/routePaths';

function EditStudent() {
  const { studentID = '' } = useParams();
  const [params] = useSearchParams();
  const { account } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const load = useCallback(
    (signal: AbortSignal) => getStudent(studentID, uid, signal),
    [studentID, uid],
  );
  const { data, error, retry } = useStudentRequest(`${uid}:${studentID}`, load);
  return data ? (
    <StudentProfileForm
      key={`${uid}:${studentID}`}
      student={data}
      search={params.toString()}
    />
  ) : (
    <StudentRequestState error={error} retry={retry} />
  );
}
export default function StudentFormPage({
  creating = false,
}: {
  creating?: boolean;
}) {
  const { studentID } = useParams();
  const [params] = useSearchParams();
  const { account } = useAuth();
  const inviting =
    account?.role === 'admin' && params.get('registration') !== 'existing';
  const filtered = new URLSearchParams(params);
  filtered.delete('registration');
  const modeLink = new URLSearchParams(filtered);
  if (inviting) modeLink.set('registration', 'existing');
  return (
    <section
      className="students-page student-editor-page"
      aria-labelledby="student-form-title"
    >
      {!creating && studentID && (
        <Link
          className="student-editor-back"
          to={`${routePaths.students}/${studentID}${params.toString() ? `?${params}` : ''}`}
        >
          <span aria-hidden="true">← </span>Back to student profile
        </Link>
      )}
      <p className="eyebrow">Directory / Students</p>
      <h1 id="student-form-title">
        {creating ? 'Add student' : 'Edit student profile'}
      </h1>
      <p className="page-description">
        {creating
          ? inviting
            ? 'Register a student and queue their account setup invitation.'
            : 'Create a profile for an existing active student account.'
          : 'Update student and guardian details.'}
      </p>
      {creating ? (
        <>
          {account?.role === 'admin' && (
            <p>
              <Link to={`?${modeLink.toString()}`}>
                {inviting
                  ? 'Create a profile for an existing account instead'
                  : 'Register with a university email instead'}
              </Link>
            </p>
          )}
          <StudentProfileForm
            key={`${account?.firebase_uid}:${inviting}`}
            inviting={inviting}
            search={filtered.toString()}
          />
        </>
      ) : (
        <EditStudent />
      )}
    </section>
  );
}
