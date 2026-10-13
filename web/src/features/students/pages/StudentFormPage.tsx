import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getStudent } from '../api/students.api';
import useAuth from '../../auth/hooks/useAuth';
import useStudentRequest from '../hooks/useStudentRequest';
import StudentRequestState from '../components/StudentRequestState';
import StudentProfileForm from '../components/StudentProfileForm';

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
  const [params] = useSearchParams();
  return (
    <section className="students-page" aria-labelledby="student-form-title">
      <p className="eyebrow">Directory / Students</p>
      <h1 id="student-form-title">
        {creating ? 'Add student' : 'Edit student profile'}
      </h1>
      <p className="page-description">
        {creating
          ? 'Create a profile for an existing active student account.'
          : 'Update student and guardian details.'}
      </p>
      {creating ? (
        <StudentProfileForm search={params.toString()} />
      ) : (
        <EditStudent />
      )}
    </section>
  );
}
