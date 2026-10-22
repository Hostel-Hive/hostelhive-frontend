export default function LateAccessDate({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  if (compact) {
    const date = new Date(value);
    const full = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(date);
    return (
      <time
        className="late-access-date-compact"
        dateTime={value}
        title={full}
        aria-label={full}
      >
        <span>
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
            date,
          )}
        </span>
        <span>
          {new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(date)}
        </span>
      </time>
    );
  }
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(new Date(value))}
    </time>
  );
}
