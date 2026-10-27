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
    <section
      className="staff-account-picker"
      aria-label="Choose existing staff account"
    >
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
                    <div className="staff-account-choice-identity">
                      <span className="staff-avatar" aria-hidden="true">
                        {(account.full_name || account.email)
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>{account.full_name || account.email}</strong>
                        {account.full_name && (
                          <span className="staff-choice-email">
                            {account.email}
                          </span>
                        )}
                        <div className="staff-choice-badges">
                          <span
                            className={`staff-role staff-role--${account.role}`}
                          >
                            {roleLabels[account.role]}
                          </span>
                          <span
                            className={`staff-access ${account.is_active ? 'staff-access--active' : 'staff-access--inactive'}`}
                          >
                            <span aria-hidden="true" />
                            {account.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelect(account)}
                      aria-label={`Choose ${account.email}`}
                    >
                      Choose account
                      <span aria-hidden="true">→</span>
                    </Button>
                  </li>
                ))}
            </ul>
            <nav
              className="staff-actions staff-account-choice-pages"
              aria-label="Account choice pages"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={!offset}
                onClick={() => setOffset((value) => Math.max(0, value - 20))}
              >
                Previous accounts
              </Button>
              <span>Account page {Math.floor(offset / 20) + 1}</span>
              <Button
                variant="secondary"
                size="sm"
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
