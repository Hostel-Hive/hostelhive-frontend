import { lazy, Suspense, useCallback, useRef } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import { getStudent } from '../api/students.api';
import useStudentRequest from '../hooks/useStudentRequest';
import StudentRequestState from '../components/StudentRequestState';
import StudentArchiveAction from '../components/StudentArchiveAction';
import StudentCheckoutAction, {
  type CheckoutHandle,
} from '../components/StudentCheckoutAction';
import StudentPhoto from '../components/StudentPhoto';
import StudentInvitationStatus from '../components/StudentInvitationStatus';
import { validInvitation } from '../api/student-invitations.api';
import StudentQR from '../components/StudentQR';
const StudentAccommodation = lazy(
  () => import('../../allocation/components/StudentAccommodation'),
);
const StudentAttendance = lazy(
  () => import('../../attendance/components/StudentAttendance'),
);

export default function StudentProfilePage() {
  const { studentID = '' } = useParams();
  const [params] = useSearchParams();
  const { account } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const checkoutAction = useRef<CheckoutHandle>(null);
  const load = useCallback(
    (signal: AbortSignal) => getStudent(studentID, uid, signal),
    [studentID, uid],
  );
  const { data, error, retry } = useStudentRequest(`${uid}:${studentID}`, load);
  const search = params.toString();
  const location = useLocation();
  const notice: unknown = location.state?.studentNotice;
  const invitation: unknown = location.state?.invitation;
  const showInvitation =
    account?.role === 'admin' &&
    location.state?.invitationActor === uid &&
    validInvitation(invitation) &&
    invitation.student_id === data?.student_id;
  return (
    <section
      className="students-page student-profile-page"
      aria-labelledby="student-profile-title"
    >
      <Link
        className="student-back"
        to={`${routePaths.students}${search ? `?${search}` : ''}`}
      >
        <span aria-hidden="true">← </span>Back to students
      </Link>
      <p className="eyebrow">Directory / Student profile</p>
      <h1 id="student-profile-title">{data?.full_name ?? 'Student profile'}</h1>
      {data && !error && (
        <p className="student-profile-subtitle">
          <span className="student-id">{data.index_no}</span>
          <span>
            {data.faculty || 'Faculty not provided'} · Year {data.year}
          </span>
        </p>
      )}
      {data &&
        (notice === 'Student profile updated.' ||
          notice === 'Student profile created.') && (
          <p role="status">{notice}</p>
        )}
      {!data || error ? (
        <StudentRequestState error={error} retry={retry} />
      ) : (
        <>
          {showInvitation && validInvitation(invitation) && (
            <StudentInvitationStatus
              key={`${uid}:${invitation.invitation_id}`}
              initial={invitation}
              uid={uid}
            />
          )}
          <div className="student-profile-actions">
            <StudentCheckoutAction
              actionRef={checkoutAction}
              key={`${uid}:${account?.role}:${data.student_id}`}
              student={data}
              search={search}
            />
            <Link
              className="button-link"
              to={`${routePaths.students}/${data.student_id}/edit${search ? `?${search}` : ''}`}
            >
              Edit profile
            </Link>
            <StudentArchiveAction
              key={data.student_id}
              student={data}
              search={search}
              onEndStay={
                account?.role === 'admin'
                  ? () => checkoutAction.current?.open()
                  : undefined
              }
            />
          </div>
          <div className="student-profile-layout">
            <div className="student-profile-tools student-profile-photo">
              <StudentPhoto
                key={`${uid}:${data.student_id}`}
                student={data}
                uid={uid}
              />
            </div>
            <div className="student-profile-info">
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
            </div>
            <div className="student-profile-tools student-profile-qr">
              <StudentQR student={data} uid={uid} />
            </div>
          </div>
          <Suspense
            fallback={<p role="status">Loading accommodation controls…</p>}
          >
            <StudentAccommodation
              studentID={data.student_id}
              studentName={data.full_name}
              eligible={data.account_active}
              uid={uid}
            />
          </Suspense>
          <Suspense
            fallback={<p role="status">Loading attendance controls…</p>}
          >
            <StudentAttendance studentID={data.student_id} uid={uid} />
          </Suspense>
        </>
      )}
    </section>
  );
}
