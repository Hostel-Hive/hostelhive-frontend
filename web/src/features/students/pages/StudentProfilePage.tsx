import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import { getStudent } from '../api/students.api';
import useStudentRequest from '../hooks/useStudentRequest';
import StudentRequestState from '../components/StudentRequestState';

export default function StudentProfilePage() {
  const { studentID = '' } = useParams();
  const [params] = useSearchParams();
  const { account } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const load = useCallback(
    (signal: AbortSignal) => getStudent(studentID, uid, signal),
    [studentID, uid],
  );
  const { data, error, retry } = useStudentRequest(`${uid}:${studentID}`, load);
  const search = params.toString();
  return (
    <section className="students-page" aria-labelledby="student-profile-title">
      <Link
        className="student-back"
        to={`${routePaths.students}${search ? `?${search}` : ''}`}
      >
        <span aria-hidden="true">← </span>Back to students
      </Link>
      <p className="eyebrow">Directory / Student profile</p>
      <h1 id="student-profile-title">{data?.full_name ?? 'Student profile'}</h1>
      {!data || error ? (
        <StudentRequestState error={error} retry={retry} />
      ) : (
        <>
          <div className="student-card">
            <h2>Student details</h2>
            <dl className="student-details">
              <div>
                <dt>Student ID</dt>
                <dd className="student-id">{data.index_no}</dd>
              </div>
              <div>
                <dt>Faculty</dt>
                <dd>{data.faculty || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Year</dt>
                <dd>{data.year}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.email || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Contact phone</dt>
                <dd>{data.contact_phone || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>{data.account_active ? 'Active' : 'Inactive'}</dd>
              </div>
            </dl>
          </div>
          <div className="student-card">
            <h2>Guardian details</h2>
            {data.guardians?.length ? (
              data.guardians.map((guardian) => (
                <dl
                  className="student-details student-guardian"
                  key={guardian.guardian_id}
                >
                  <div>
                    <dt>Name</dt>
                    <dd>{guardian.name || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Relationship</dt>
                    <dd>{guardian.relationship || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Contact phone</dt>
                    <dd>{guardian.contact_phone || 'Not provided'}</dd>
                  </div>
                </dl>
              ))
            ) : (
              <p>No guardian details provided.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
