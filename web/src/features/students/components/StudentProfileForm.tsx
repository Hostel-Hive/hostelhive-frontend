import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import ErrorToast from '../../../shared/components/ui/ErrorToast';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import {
  createStudentByEmail,
  updateStudent,
  studentError,
  StudentRequestError,
} from '../api/students.api';
import {
  registerStudentInvitation,
  type StudentInvitationInput,
} from '../api/student-invitations.api';
import StudentDiscardDialog from './StudentDiscardDialog';
import type { CreateStudentInput, Student } from '../student.types';
import { normalizeStudent, validateStudent } from '../student.schema';
import NavigationIcon from '../../../layouts/components/NavigationIcon';

export default function StudentProfileForm({
  student,
  search,
  inviting = false,
}: {
  student?: Student;
  search: string;
  inviting?: boolean;
}) {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [initial] = useState<CreateStudentInput & { email: string }>(() => ({
    email: '',
    user_id: student?.user_id ?? '',
    index_no: student?.index_no ?? '',
    full_name: student?.full_name ?? '',
    faculty: student?.faculty ?? '',
    year: student?.year ?? 0,
    contact_phone: student?.contact_phone ?? '',
    guardians: student?.guardians?.length
      ? student.guardians.map((g) => ({
          name: g.name,
          relationship: g.relationship,
          contact_phone: g.contact_phone,
        }))
      : [{ name: '', relationship: '', contact_phone: '' }],
  }));
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<StudentRequestError>();
  const [notificationDismissed, setNotificationDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<StudentInvitationInput | null>(null);
  const [discard, setDiscard] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const allowLeave = useRef(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const blocker = useBlocker(
    () => !allowLeave.current && (dirty || operation.current),
  );
  const suffix = search ? `?${search}` : '';
  const cancelTo = student
    ? `${routePaths.students}/${student.student_id}${suffix}`
    : `${routePaths.students}${suffix}`;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  const locked =
    pending ||
    error?.kind === 'session' ||
    error?.kind === 'forbidden' ||
    error?.kind === 'not-found';
  function change(key: string, text: string) {
    setValue((current) => ({
      ...current,
      [key]: key === 'year' ? Number(text) : text,
    }));
    setErrors({});
    setError(undefined);
  }
  function field(
    id: string,
    label: string,
    text: string,
    update: (text: string) => void,
    maxLength: number,
  ) {
    return (
      <div className="student-form-field" key={id}>
        <label htmlFor={id}>{label}</label>
        <Input
          id={id}
          name={id}
          type={id === 'email' ? 'email' : 'text'}
          value={text}
          maxLength={maxLength}
          onChange={(event) => update(event.target.value)}
          aria-invalid={Boolean(errors[id])}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
        />
        {errors[id] && (
          <p id={`${id}-error`} className="field-error">
            {errors[id]}
          </p>
        )}
      </div>
    );
  }
  async function submit() {
    if (operation.current || locked) return;
    const nextErrors = validateStudent(value, false);
    if (!student && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()))
      nextErrors.email = 'Enter a valid university email.';
    setErrors(nextErrors);
    setError(undefined);
    setNotificationDismissed(false);
    if (Object.keys(nextErrors).length) {
      form.current
        ?.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[name="${nextErrors.email ? 'email' : Object.keys(nextErrors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    operation.current = true;
    setPending(true);
    controller.current = new AbortController();
    try {
      const input = normalizeStudent(value);
      const details = {
        index_no: input.index_no,
        full_name: input.full_name,
        faculty: input.faculty,
        year: input.year,
        contact_phone: input.contact_phone,
        guardians: input.guardians,
      };
      if (inviting) {
        if (account?.role !== 'admin')
          throw new StudentRequestError(
            'forbidden',
            'Only an Admin can register invitations.',
          );
        const normalized = {
          ...details,
          email: value.email.trim().toLowerCase(),
        };
        const previous = attempt.current;
        const { request_id: previousID, ...previousDetails } = previous ?? {};
        if (
          !uncertain &&
          JSON.stringify(previousDetails) !== JSON.stringify(normalized)
        ) {
          attempt.current = { ...normalized, request_id: crypto.randomUUID() };
        } else if (!previousID) {
          attempt.current = { ...normalized, request_id: crypto.randomUUID() };
        }
        const result = await registerStudentInvitation(
          attempt.current!,
          account.firebase_uid,
          controller.current.signal,
        );
        if (active.current) {
          allowLeave.current = true;
          navigate(
            `${routePaths.students}/${result.invitation.student_id}${suffix}`,
            {
              replace: true,
              state: {
                invitation: result.invitation,
                invitationActor: account.firebase_uid,
              },
            },
          );
        }
        return;
      }
      const saved = student
        ? await updateStudent(
            student.student_id,
            details,
            account!.firebase_uid,
            controller.current.signal,
          )
        : await createStudentByEmail(
            { ...details, email: value.email.trim().toLowerCase() },
            account!.firebase_uid,
            controller.current.signal,
          );
      if (active.current) {
        allowLeave.current = true;
        navigate(`${routePaths.students}/${saved.student_id}${suffix}`, {
          replace: true,
          state: {
            studentNotice: student
              ? 'Student profile updated.'
              : 'Student profile created.',
          },
        });
      }
    } catch (reason) {
      if (active.current) {
        const failure = studentError(reason);
        if (inviting) {
          setUncertain(
            failure.kind === 'unavailable' ||
              (uncertain && failure.kind === 'session'),
          );
          setError(failure);
        } else
          setError(
            failure.kind === 'unavailable'
              ? new StudentRequestError(
                  'unavailable',
                  'Unable to confirm the profile save. Your form values have been kept.',
                )
              : failure,
          );
      }
    } finally {
      operation.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <>
      <form
        className="student-card student-profile-form student-editor-form"
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && !notificationDismissed && (
          <ErrorToast
            title={
              error.kind === 'duplicate'
                ? 'Registration already exists'
                : error.kind === 'session'
                  ? 'Please sign in again'
                  : inviting
                    ? 'Registration could not be confirmed'
                    : 'Profile could not be saved'
            }
            onDismiss={
              error.kind === 'session'
                ? undefined
                : () => setNotificationDismissed(true)
            }
          >
            {error.message}
            {error.kind === 'unavailable' && !inviting && (
              <p>
                The service could not confirm the save. Check the existing
                profile before submitting again if the connection was
                interrupted.
              </p>
            )}
            {error.kind === 'session' && (
              <Button onClick={() => void signOut()}>Sign in again</Button>
            )}
          </ErrorToast>
        )}
        <fieldset disabled={locked || uncertain}>
          <legend>
            <span className="student-form-section-icon">
              <NavigationIcon name="students" />
            </span>
            Student details
          </legend>
          {!student && !inviting && (
            <>
              <p className="student-form-help student-invitation-note">
                Enter the university email of an existing active student
                account. This creates their profile only. New accounts and setup
                invitations are managed by an administrator.
              </p>
              {field(
                'email',
                'University email',
                value.email,
                (text) => change('email', text),
                254,
              )}
            </>
          )}
          {inviting && (
            <>
              <p className="student-form-help student-invitation-note">
                Register the student using their university email. They will
                receive a private link to choose their HostelHive password.
                Email delivery is processed in the background.
              </p>
              {field(
                'email',
                'University email',
                value.email,
                (text) => change('email', text),
                254,
              )}
            </>
          )}
          {student && (
            <p className="student-form-help student-login-note">
              Login email: {student.email}. Account identity and login
              credentials are managed separately.
            </p>
          )}
          <div className="student-form-grid">
            {field(
              'index_no',
              'University registration / index number',
              value.index_no,
              (text) => change('index_no', text),
              64,
            )}
            {field(
              'full_name',
              'Full name',
              value.full_name,
              (text) => change('full_name', text),
              200,
            )}
            {field(
              'faculty',
              'Faculty',
              value.faculty,
              (text) => change('faculty', text),
              120,
            )}
            <div className="student-form-field">
              <label htmlFor="year">Year</label>
              <select
                id="year"
                name="year"
                className="ui-input"
                value={value.year}
                onChange={(event) => change('year', event.target.value)}
                aria-invalid={Boolean(errors.year)}
                aria-describedby={errors.year ? 'year-error' : undefined}
              >
                <option value={0}>Select year</option>
                {Array.from({ length: 5 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    Year {i + 1}
                  </option>
                ))}
              </select>
              {errors.year && (
                <p className="field-error" id="year-error">
                  {errors.year}
                </p>
              )}
            </div>
            {field(
              'contact_phone',
              'Contact phone',
              value.contact_phone,
              (text) => change('contact_phone', text),
              32,
            )}
          </div>
        </fieldset>
        <fieldset disabled={locked || uncertain}>
          <legend>
            <span className="student-form-section-icon">
              <NavigationIcon name="users" />
            </span>
            Guardian details
          </legend>
          <p className="student-form-help">
            Provide at least one guardian; up to ten are supported.
          </p>
          {value.guardians.map((guardian, i) => (
            <div className="student-form-guardian" key={i}>
              <h3>Guardian {i + 1}</h3>
              <div className="student-form-grid">
                {(['name', 'relationship', 'contact_phone'] as const).map(
                  (key) =>
                    field(
                      `guardian-${i}-${key}`,
                      key === 'name'
                        ? `Guardian ${i + 1} name`
                        : key === 'relationship'
                          ? `Guardian ${i + 1} relationship`
                          : `Guardian ${i + 1} phone`,
                      guardian[key],
                      (text) => {
                        setValue((current) => ({
                          ...current,
                          guardians: current.guardians.map((g, index) =>
                            index === i ? { ...g, [key]: text } : g,
                          ),
                        }));
                        setErrors({});
                        setError(undefined);
                      },
                      key === 'name' ? 200 : key === 'relationship' ? 80 : 32,
                    ),
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="student-remove-guardian"
                disabled={value.guardians.length === 1}
                onClick={() => {
                  setValue((current) => ({
                    ...current,
                    guardians: current.guardians.filter(
                      (_, index) => index !== i,
                    ),
                  }));
                  setErrors({});
                }}
                aria-label={`Remove guardian ${i + 1}`}
              >
                Remove guardian
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            disabled={value.guardians.length >= 10}
            onClick={() =>
              setValue((current) => ({
                ...current,
                guardians: [
                  ...current.guardians,
                  { name: '', relationship: '', contact_phone: '' },
                ],
              }))
            }
          >
            <span aria-hidden="true">＋ </span>Add guardian
          </Button>
        </fieldset>
        <div className="student-form-actions student-editor-footer">
          {inviting && (
            <p className="student-registration-footer-note">
              Account setup is sent by email. No password is created in this
              form.
            </p>
          )}
          <Button
            type="submit"
            disabled={locked || (Boolean(student) && !dirty)}
          >
            {pending
              ? 'Saving…'
              : inviting
                ? uncertain
                  ? 'Retry same registration'
                  : 'Register student'
                : student
                  ? 'Save changes'
                  : 'Create profile'}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (dirty) setDiscard(true);
              else navigate(cancelTo);
            }}
          >
            Cancel
          </Button>
        </div>
        {uncertain && (
          <p role="status">
            The registration result is unknown. Your original details are locked
            so retrying safely checks the same registration. If you leave or
            reload, check the directory before starting another registration.
          </p>
        )}
        {pending && (
          <p role="status">
            {inviting ? 'Registering student…' : 'Saving student profile…'}
          </p>
        )}
      </form>
      {(discard || blocker.state === 'blocked') && (
        <StudentDiscardDialog
          pending={pending}
          keep={() => {
            setDiscard(false);
            if (blocker.state === 'blocked') blocker.reset();
          }}
          discard={() => {
            allowLeave.current = true;
            if (blocker.state === 'blocked') blocker.proceed();
            else navigate(cancelTo);
          }}
        />
      )}
    </>
  );
}
