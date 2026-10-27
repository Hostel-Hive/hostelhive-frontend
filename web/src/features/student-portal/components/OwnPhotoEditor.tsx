import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import { validateStudentImage } from '../../students/student-image';
import {
  uploadOwnPhoto,
  removeOwnPhoto,
  OwnPhotoInputError,
} from '../api/own-photo.api';
import {
  getOwnProfile,
  isAccessError,
  portalError,
  StudentPortalError,
} from '../api/student-portal.api';
import type { OwnStudentProfile } from '../student-portal.types';
import PrivateStudentImage from './PrivateStudentImage';
import OwnStudentPhoto from './OwnStudentPhoto';

export default function OwnPhotoEditor({
  profile,
  uid,
  onClose,
  onSaved,
  onAccessError,
}: {
  profile: OwnStudentProfile;
  uid: string;
  onClose: () => void;
  onSaved: (profile: OwnStudentProfile, message: string) => void;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const work = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File>();
  const [phase, setPhase] = useState<
    'validating' | 'uploading' | 'removing' | 'checking' | null
  >(null);
  const [uncertain, setUncertain] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState('');
  const locked = Boolean(phase) || uncertain;
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    picker.current?.focus();
    return () => {
      work.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);

  async function select(selected?: File) {
    if (work.current || uncertain) return;
    setFile(undefined);
    setConfirmRemoval(false);
    setError('');
    if (!selected) return;
    const controller = new AbortController();
    work.current = controller;
    setPhase('validating');
    try {
      await validateStudentImage(selected);
      if (!controller.signal.aborted) setFile(selected);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : 'Choose a valid photo.',
        );
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPhase(null);
      }
    }
  }
  async function run(action: 'upload' | 'remove' | 'check') {
    if (
      work.current ||
      (uncertain && action !== 'check') ||
      (action === 'upload' && !file)
    )
      return;
    const controller = new AbortController();
    work.current = controller;
    setPhase(
      action === 'upload'
        ? 'uploading'
        : action === 'remove'
          ? 'removing'
          : 'checking',
    );
    setError('');
    try {
      if (action === 'upload')
        await uploadOwnPhoto(file!, profile.student_id, uid, controller.signal);
      if (action === 'remove') await removeOwnPhoto(uid, controller.signal);
      if (controller.signal.aborted) return;
      const current = await getOwnProfile(uid, controller.signal);
      if (current.student_id !== profile.student_id)
        throw new StudentPortalError(
          'not-found',
          'Your student profile changed. Reload your profile.',
        );
      if (!controller.signal.aborted)
        onSaved(
          current,
          action === 'check'
            ? 'Current profile reloaded. Review your photo before making another change.'
            : action === 'upload'
              ? 'Profile photo saved. Showing the current profile.'
              : 'Profile photo removed. Showing the current profile.',
        );
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof OwnPhotoInputError) setError(reason.message);
      else {
        const failure = portalError(reason);
        if (isAccessError(failure) || failure.kind === 'not-found')
          onAccessError(failure);
        else {
          setUncertain(true);
          setError(failure.message);
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPhase(null);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="portal-profile-editor portal-photo-editor"
      aria-labelledby="own-photo-title"
      aria-describedby="own-photo-help"
      aria-busy={Boolean(phase)}
      onCancel={(event) => {
        event.preventDefault();
        if (!work.current) onClose();
      }}
    >
      <p className="portal-kicker">Personal details</p>
      <h2 id="own-photo-title">Profile photo</h2>
      <p id="own-photo-help" className="portal-muted">
        Choose a JPEG or PNG up to 5 MiB, with at most 4096 pixels per side and
        12 million pixels. Your photo is visible to authorized hostel staff.
      </p>
      <div className="portal-photo-editor-preview">
        {file ? (
          <PrivateStudentImage
            key={file.name + file.lastModified}
            blob={file}
            alt="Selected profile photo preview"
            onError={() => {
              setFile(undefined);
              setError(
                'This photo could not be displayed. Choose another photo.',
              );
            }}
          />
        ) : profile.profile_image_url ? (
          <OwnStudentPhoto
            uid={uid}
            name={profile.full_name}
            onAccessError={onAccessError}
          />
        ) : (
          <div className="portal-avatar" aria-label="No profile photo">
            {profile.full_name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('') || 'S'}
          </div>
        )}
        {file && <p>{file.name}</p>}
      </div>
      <label className="portal-photo-picker">
        Choose profile photo
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png"
          disabled={locked}
          onChange={(event) => {
            void select(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      <p ref={alert} role={error ? 'alert' : undefined} tabIndex={-1}>
        {error}
      </p>
      {phase && (
        <p role="status">
          {phase === 'validating'
            ? 'Checking photo…'
            : phase === 'uploading'
              ? 'Uploading photo…'
              : phase === 'removing'
                ? 'Removing photo…'
                : 'Checking current profile…'}
        </p>
      )}
      {uncertain && (
        <div className="portal-complaint-warning">
          <p>
            The request may have completed. Check your current profile before
            uploading or removing another photo.
          </p>
          <Button
            variant="secondary"
            disabled={Boolean(phase)}
            onClick={() => void run('check')}
          >
            Check current profile
          </Button>
        </div>
      )}
      {confirmRemoval && !uncertain && (
        <div className="portal-complaint-warning" role="alert">
          <p>Remove your current profile photo?</p>
          <div className="portal-actions">
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => setConfirmRemoval(false)}
            >
              Keep photo
            </Button>
            <Button
              variant="danger"
              disabled={locked}
              onClick={() => void run('remove')}
            >
              Confirm removal
            </Button>
          </div>
        </div>
      )}
      <div className="portal-actions">
        <Button variant="secondary" disabled={Boolean(phase)} onClick={onClose}>
          Close
        </Button>
        {profile.profile_image_url && !confirmRemoval && (
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() => setConfirmRemoval(true)}
          >
            Remove photo
          </Button>
        )}
        <Button
          disabled={locked || !file || confirmRemoval}
          onClick={() => void run('upload')}
        >
          {profile.profile_image_url ? 'Replace photo' : 'Upload photo'}
        </Button>
      </div>
    </dialog>
  );
}
