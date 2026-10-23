export default function ComplaintDate({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const date = new Date(value);
  const full = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date);
  if (compact)
    return (
      <time
        className="complaint-compact-date"
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
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(new Date(value))}
    </time>
  );
}
