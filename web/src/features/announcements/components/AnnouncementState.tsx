import Button from '../../../shared/components/ui/Button';
import { announcementAccessError } from '../api/announcements.api';
import type { AnnouncementError } from '../api/announcements.api';
export default function AnnouncementState({
  error,
  retry,
}: {
  error?: AnnouncementError;
  retry: () => void;
}) {
  return error ? (
    <div>
      <p role="alert">{error.message}</p>
      {!announcementAccessError(error) && (
        <Button size="sm" onClick={retry}>
          Retry announcements
        </Button>
      )}
    </div>
  ) : (
    <p role="status">Loading announcements…</p>
  );
}
