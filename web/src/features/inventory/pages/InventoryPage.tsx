import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import type { InventoryPage as Page } from '../api/inventory.api';
import {
  browseInventory,
  InventoryManagementError,
  inventoryKind,
  inventoryLabel,
  inventoryRecordID,
  parseInventoryFilter,
  type InventoryRecord,
} from '../api/inventory-management.api';
import InventoryEditor from '../components/InventoryEditor';

export default function InventoryPage() {
  const { account, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const filter = parseInventoryFilter(params);
  const kind = filter ? inventoryKind(filter) : 'blocks';
  const uid = account?.firebase_uid ?? '';
  const key = `${uid}:${search}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    revision: number;
    page?: Page<InventoryRecord>;
    error?: string;
    denied?: boolean;
    session?: boolean;
  }>();
  const [editor, setEditor] = useState<{
    key: string;
    row?: InventoryRecord;
  }>();
  const [notice, setNotice] = useState('');
  const [denial, setDenial] = useState<{ key: string; session: boolean }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const current =
    result?.key === key && result.revision === revision ? result : undefined;
  const blocked = denial?.key === key || current?.denied || current?.session;
  const page = !blocked ? current?.page : undefined;
  const admin = account?.role === 'admin';
  useEffect(() => {
    const controller = new AbortController();
    const parsed = parseInventoryFilter(new URLSearchParams(search));
    if (!parsed || !uid) return;
    void browseInventory(parsed, uid, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, revision, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            revision,
            error:
              error instanceof Error
                ? error.message
                : 'Inventory is unavailable. Please try again.',
            denied:
              error instanceof InventoryManagementError &&
              error.kind === 'forbidden',
            session:
              error instanceof AuthorizedRequestError &&
              error.kind === 'session',
          });
      });
    return () => controller.abort();
  }, [search, uid, key, revision]);
  function navigate(next: URLSearchParams) {
    setNotice('');
    setParams(next);
  }
  function refresh() {
    setRevision((value) => value + 1);
  }
  function saved() {
    setEditor(undefined);
    setNotice('Inventory saved. The listing is being refreshed.');
    heading.current?.focus();
    const next = new URLSearchParams(params);
    if (!editor?.row) next.delete('offset');
    setParams(next, { replace: true });
    refresh();
  }
  const singular = kind.slice(0, -1);
  const review = new URLSearchParams(params);
  review.delete('offset');
  review.delete('available');
  return (
    <section className="inventory-page" aria-labelledby="inventory-title">
      <p className="eyebrow">Accommodation / Inventory</p>
      <h1 id="inventory-title" ref={heading} tabIndex={-1}>
        Hostel inventory
      </h1>
      <p className="page-description">
        Browse blocks, rooms and beds. Occupancy reflects active bed
        assignments.
      </p>
      <div className="inventory-panel">
        <nav
          aria-label="Inventory hierarchy"
          className="inventory-actions inventory-hierarchy"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-current={kind === 'blocks' ? 'page' : undefined}
            onClick={() => navigate(new URLSearchParams())}
          >
            All blocks
          </Button>
          {filter?.blockID && (
            <Button
              variant="ghost"
              size="sm"
              aria-current={kind === 'rooms' ? 'page' : undefined}
              onClick={() =>
                navigate(new URLSearchParams({ block_id: filter.blockID! }))
              }
            >
              Rooms in selected block
            </Button>
          )}
          {filter?.roomID && (
            <span aria-current="page">Beds in selected room</span>
          )}
        </nav>
        {!filter ? (
          <div role="alert">
            <p>Invalid inventory filters. Choose a valid block and room.</p>
            <Button onClick={() => navigate(new URLSearchParams())}>
              Reset filters
            </Button>
          </div>
        ) : (
          <>
            {filter.blockID && (
              <p className="inventory-parent">
                Block ID: {filter.blockID}
                {filter.roomID && (
                  <>
                    <br />
                    Room ID: {filter.roomID}
                  </>
                )}
              </p>
            )}
            <div className="inventory-toolbar">
              <h2>{kind[0].toUpperCase() + kind.slice(1)}</h2>
              {kind === 'beds' && (
                <label>
                  Availability{' '}
                  <select
                    className="ui-input"
                    value={params.get('available') ?? ''}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      next.delete('offset');
                      if (event.target.value)
                        next.set('available', event.target.value);
                      else next.delete('available');
                      navigate(next);
                    }}
                  >
                    <option value="">All beds</option>
                    <option value="true">Available beds</option>
                    <option value="false">Occupied beds</option>
                  </select>
                </label>
              )}
              <Button variant="secondary" size="sm" onClick={refresh}>
                Refresh inventory
              </Button>
              {admin && page && (
                <Button size="sm" onClick={() => setEditor({ key })}>
                  Create {singular}
                </Button>
              )}
            </div>
            {!admin && (
              <p>
                Read-only inventory. Administrators manage names and labels.
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {blocked ? (
              <div role="alert">
                <p>
                  {denial?.session || current?.session
                    ? 'Your session has expired. Sign in again.'
                    : 'Access denied. Your account is not authorized for this inventory action.'}
                </p>
                <Button
                  onClick={() => {
                    void signOut().catch(() =>
                      setNotice('Sign-out failed. Please try again.'),
                    );
                  }}
                >
                  Sign out
                </Button>
              </div>
            ) : current?.error ? (
              <div role="alert">
                <p>{current.error}</p>
                <Button onClick={refresh}>Retry inventory</Button>
              </div>
            ) : !page ? (
              <p role="status">Loading inventory…</p>
            ) : (
              <>
                {page.items.length === 0 ? (
                  <p role="status" className="inventory-empty">
                    {filter.offset
                      ? 'No items on this page. Go to the previous page.'
                      : kind === 'beds' && filter.available !== undefined
                        ? 'No beds match this availability filter.'
                        : `No ${kind} yet.`}
                  </p>
                ) : (
                  <div
                    className="inventory-table-wrap"
                    role="region"
                    aria-label="Inventory table"
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        {page.total} {kind} in this selection
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            {kind === 'blocks'
                              ? 'Block name'
                              : `${singular[0].toUpperCase() + singular.slice(1)} label`}
                          </th>
                          {kind === 'blocks' && <th scope="col">Rooms</th>}
                          {kind === 'beds' ? (
                            <th scope="col">Availability</th>
                          ) : (
                            <>
                              <th scope="col">Capacity</th>
                              <th scope="col">Occupied beds</th>
                              <th scope="col">Available beds</th>
                            </>
                          )}
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.items.map((row) => (
                          <tr key={inventoryRecordID(row)}>
                            <th scope="row">
                              <div className="inventory-identity">
                                <svg
                                  className="inventory-row-icon"
                                  aria-hidden="true"
                                  width="36"
                                  height="36"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path
                                    d={
                                      kind === 'beds'
                                        ? 'M3 18V7m18 11V7M3 14h18M3 10h18M6 10V7h5v3m2 0V7h5v3'
                                        : kind === 'rooms'
                                          ? 'M5 21V3h14v18M3 21h18M15 12h.01'
                                          : 'M5 21V3h14v18M3 21h18M9 21v-4h6v4M9 7h1m4 0h1M9 11h1m4 0h1'
                                    }
                                  />
                                </svg>
                                <span>{inventoryLabel(row)}</span>
                              </div>
                            </th>
                            {kind === 'blocks' && <td>{row.room_count}</td>}
                            {kind === 'beds' ? (
                              <td>
                                <span
                                  className={`inventory-badge ${row.available ? 'inventory-badge--available' : ''}`}
                                >
                                  {row.available ? 'Available' : 'Occupied'}
                                </span>
                              </td>
                            ) : (
                              <>
                                <td>{row.capacity}</td>
                                <td>{row.occupied_beds}</td>
                                <td>
                                  <span className="inventory-available-count">
                                    {row.available_beds}
                                  </span>
                                </td>
                              </>
                            )}
                            <td>
                              <div className="inventory-actions">
                                {kind !== 'beds' && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      navigate(
                                        new URLSearchParams(
                                          kind === 'blocks'
                                            ? { block_id: row.block_id }
                                            : {
                                                block_id: row.block_id,
                                                room_id: row.room_id!,
                                              },
                                        ),
                                      )
                                    }
                                  >
                                    View {kind === 'blocks' ? 'rooms' : 'beds'}{' '}
                                    <span className="sr-only">
                                      {' '}
                                      for {inventoryLabel(row)}
                                    </span>
                                  </Button>
                                )}
                                {admin && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Rename ${inventoryLabel(row)}`}
                                    onClick={() => setEditor({ key, row })}
                                  >
                                    Rename
                                  </Button>
                                )}
                                {kind === 'beds' && !admin && (
                                  <span>Read only</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <nav
                  aria-label="Inventory pagination"
                  className="inventory-pagination"
                >
                  <Button
                    variant="secondary"
                    disabled={!filter.offset}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set(
                        'offset',
                        String(Math.max(0, filter.offset - 20)),
                      );
                      navigate(next);
                    }}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {Math.floor(filter.offset / 20) + 1} · {page.total}{' '}
                    {kind}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={
                      filter.offset + 20 >= page.total ||
                      filter.offset + 20 > 100000
                    }
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set('offset', String(filter.offset + 20));
                      navigate(next);
                    }}
                  >
                    Next
                  </Button>
                </nav>
                {filter.offset + 20 >= 100000 && page.total > 100020 && (
                  <p>
                    Further pages exceed the supported inventory range. Narrow
                    your selection.
                  </p>
                )}
              </>
            )}
            {admin && editor?.key === key && !blocked && (
              <InventoryEditor
                key={key}
                kind={kind}
                filter={filter}
                uid={uid}
                row={editor.row}
                reviewURL={`?${review}`}
                onClose={() => {
                  setEditor(undefined);
                }}
                onSaved={saved}
                onDenied={(session) => {
                  setEditor(undefined);
                  setDenial({ key, session });
                }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
