import { useEffect, useId, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import { activeFaculties, type Faculty } from '../api/faculties.api';

export default function FacultySelect({
  uid,
  value,
  onChange,
  disabled,
  preservedValue = '',
  error,
}: {
  uid: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  preservedValue?: string;
  error?: string;
}) {
  const id = useId();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    uid: string;
    rows?: Faculty[];
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void activeFaculties(uid, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setResult({ uid, rows });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            uid,
            error: 'Unable to load faculties. Retry to select a faculty.',
          });
      });
    return () => controller.abort();
  }, [uid, revision]);
  const current = result?.uid === uid ? result : undefined;
  const rows = current?.rows ?? [];
  const legacy = preservedValue && !rows.some((f) => f.name === preservedValue);
  return (
    <div className="faculty-select student-form-field">
      <label htmlFor={id}>Faculty</label>
      <select
        className="ui-input"
        id={id}
        value={value}
        required
        disabled={disabled || !current?.rows}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
      >
        <option value="">
          {current?.error
            ? 'Faculties unavailable'
            : current?.rows
              ? 'Select faculty'
              : 'Loading faculties…'}
        </option>
        {legacy && (
          <option value={preservedValue}>
            {preservedValue} (current faculty)
          </option>
        )}
        {rows.map((f) => (
          <option key={f.faculty_id} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
      <div id={`${id}-help`}>
        {error && <p className="field-error">{error}</p>}
        {current?.error ? (
          <>
            <p role="alert">{current.error}</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setResult(undefined);
                setRevision((v) => v + 1);
              }}
            >
              Retry faculties
            </Button>
          </>
        ) : current?.rows && !rows.length ? (
          <p>
            No active faculties. Ask an administrator to add or activate a
            faculty.
          </p>
        ) : (
          <p className="muted">
            Choose an active faculty from the hostel catalogue.
          </p>
        )}
      </div>
    </div>
  );
}
