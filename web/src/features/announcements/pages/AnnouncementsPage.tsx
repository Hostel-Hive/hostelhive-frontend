import { useState } from 'react';
import useAuth from '../../auth/hooks/useAuth';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import AnnouncementList from '../components/AnnouncementList';
import AnnouncementDetail from '../components/AnnouncementDetail';
import AnnouncementForm from '../components/AnnouncementForm';
import type { AnnouncementError } from '../api/announcements.api';

export default function AnnouncementsPage({
  view = 'list',
}: {
  view?: 'list' | 'detail' | 'new';
}) {
  const { account } = useAuth();
  if (!account || (account.role !== 'admin' && account.role !== 'warden'))
    return (
      <p role="alert">Staff access is required for announcement management.</p>
    );
  return (
    <StaffAnnouncements
      key={`${account.firebase_uid}:${account.role}`}
      uid={account.firebase_uid}
      userID={account.user_id}
      view={view}
    />
  );
}
function StaffAnnouncements({
  uid,
  userID,
  view,
}: {
  uid: string;
  userID: string;
  view: 'list' | 'detail' | 'new';
}) {
  const { retry, signOut } = useAuth();
  const [denied, setDenied] = useState<AnnouncementError>();
  const props = {
    uid,
    basePath: routePaths.announcements,
    staff: true,
    onAccessError: setDenied,
  };
  return (
    <section className="announcements-page">
      <p className="eyebrow">Communication / Announcements</p>
      <h1>
        {view === 'new'
          ? 'New announcement'
          : view === 'detail'
            ? 'Announcement'
            : 'Announcements'}
      </h1>
      {denied ? (
        <div>
          <p role="alert">{denied.message}</p>
          <div className="announcement-toolbar">
            <Button
              size="sm"
              onClick={() => void retry().then(() => setDenied(undefined))}
            >
              Verify account access
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void signOut()}
            >
              Sign in again
            </Button>
          </div>
        </div>
      ) : view === 'new' ? (
        <AnnouncementForm {...props} userID={userID} />
      ) : view === 'detail' ? (
        <AnnouncementDetail {...props} />
      ) : (
        <AnnouncementList {...props} />
      )}
    </section>
  );
}
