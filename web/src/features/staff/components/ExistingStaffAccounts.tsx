import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  listUsers,
  roleLabels,
  UserManagementError,
  type UserPage,
  type ManagedUser,
} from '../../users/api/users.api';
export default function ExistingStaffAccounts({
  uid,
  onSelect,
  onDenied,
}: {
  uid: string;
  onSelect: (account: ManagedUser) => void;
  onDenied: (message: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    page?: UserPage;
    error?: string;
  }>();
  const key = `${offset}:${revision}`;
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void listUsers(uid, controller.signal, offset)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, page });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (
          error instanceof UserManagementError &&
          ['session', 'forbidden'].includes(error.kind)
        )
          onDenied(error.message);
        else
          setResult({
            key,
            error: 'Accounts could not be loaded. Please try again.',
          });
      });
    return () => controller.abort();
  }, [uid, offset, key, onDenied]);
  return (
    <section aria-label="Choose existing staff account">
      <h2>Existing staff accounts</h2>
      <p>
        Staff accounts from the current account page are shown. Students are
        excluded from these choices.
      </p>
      {!current ? (
        <p role="status">Loading account choices…</p>
      ) : current.error ? (
        <>
          <p role="alert">{current.error}</p>
          <Button onClick={() => setRevision((value) => value + 1)}>
            Retry account choices
          </Button>
        </>
      ) : (
        current.page && (
          <>
            {!current.page.users.some(
              (account) => account.role !== 'student',
            ) && <p>No staff accounts on this page.</p>}
            <ul className="staff-account-choices">
              {current.page.users
                .filter((account) => account.role !== 'student')
                .map((account) => (
                  <li key={account.user_id}>
                    <span>
                      {account.email} — {roleLabels[account.role]} (
                      {account.is_active ? 'Active' : 'Inactive'})
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => onSelect(account)}
                      aria-label={`Choose ${account.email}`}
                    >
                      Choose account
                    </Button>
                  </li>
                ))}
            </ul>
            <nav className="staff-actions" aria-label="Account choice pages">
              <Button
                variant="secondary"
                disabled={!offset}
                onClick={() => setOffset((value) => Math.max(0, value - 20))}
              >
                Previous accounts
              </Button>
              <span>Account page {Math.floor(offset / 20) + 1}</span>
              <Button
                variant="secondary"
                disabled={!current.page.has_more || offset + 20 > 1000000}
                onClick={() => setOffset((value) => value + 20)}
              >
                Next accounts
              </Button>
            </nav>
          </>
        )
      )}
    </section>
  );
}
