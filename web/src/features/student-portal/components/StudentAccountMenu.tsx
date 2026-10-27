import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import '../../../styles/account-menu.css';

export default function StudentAccountMenu({
  name,
  email,
  signOut,
  roleLabel = 'Student',
  profilePath = routePaths.ownStudentProfile,
}: {
  name?: string;
  email: string;
  signOut: () => Promise<void>;
  roleLabel?: string;
  profilePath?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const initialItem = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const menuId = useId();
  const displayName = name?.trim() || `${roleLabel} account`;
  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (error && !pending) trigger.current?.focus();
  }, [error, pending]);
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!open) return;
    const panel = popup.current!;
    function place() {
      const anchor = trigger.current!.getBoundingClientRect();
      const width = Math.min(240, window.innerWidth - 24);
      const above = anchor.top - 20;
      const below = window.innerHeight - anchor.bottom - 20;
      const height = Math.min(
        panel.getBoundingClientRect().height || 220,
        window.innerHeight - 24,
      );
      const useAbove = above >= height || above > below;
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
      panel.style.top = `${useAbove ? Math.max(12, anchor.top - height - 8) : anchor.bottom + 8}px`;
      panel.style.maxHeight = `${Math.max(0, useAbove ? above : below)}px`;
      panel.style.visibility = 'visible';
    }
    place();
    panel
      .querySelectorAll<HTMLElement>('[role="menuitem"]')
      [initialItem.current]?.focus();
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  function menuKey(event: KeyboardEvent) {
    const items = [
      ...popup.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close(true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    }
  }
  async function logout() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    close();
    try {
      await signOut();
    } catch {
      if (mounted.current) {
        setError('Unable to sign out. Please try again.');
        trigger.current?.focus();
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <div className="portal-account-control">
      <button
        ref={trigger}
        type="button"
        className="portal-account-trigger"
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-busy={pending}
        disabled={pending}
        onClick={() => {
          initialItem.current = 0;
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            initialItem.current =
              profilePath && (event.key === 'ArrowUp' || event.key === 'End')
                ? 1
                : 0;
            setOpen(true);
          }
        }}
      >
        <span className="portal-account-avatar" aria-hidden="true">
          {initials || (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </svg>
          )}
        </span>
        <span className="portal-account-text">
          <strong>{pending ? 'Signing out…' : displayName}</strong>
          <span title={email}>{email}</span>
        </span>
        <svg
          className="portal-account-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
        </svg>
      </button>
      {error && (
        <p role="alert" className="portal-account-error">
          {error}
        </p>
      )}
      {open &&
        createPortal(
          <div ref={popup} className="portal-account-popup" onKeyDown={menuKey}>
            <div className="portal-account-summary">
              <strong>{displayName}</strong>
              <span>{email}</span>
              <span className="portal-account-role">{roleLabel}</span>
            </div>
            <div id={menuId} role="menu" aria-label={`${roleLabel} account`}>
              {profilePath && (
                <Link
                  role="menuitem"
                  tabIndex={-1}
                  to={profilePath}
                  onClick={() => close()}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                  </svg>
                  My profile
                </Link>
              )}
              {profilePath && (
                <div className="portal-account-divider" role="separator" />
              )}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="portal-account-logout"
                onClick={() => void logout()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M9 4H4v16h5m6-12 4 4-4 4m-6-4h10" />
                </svg>
                Sign out
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
