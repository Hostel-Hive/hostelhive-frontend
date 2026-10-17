import { useEffect, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import { AuthorizedRequestError } from '../../auth/api/authorized-request';
import {
  InventoryError,
  listInventory,
} from '../../inventory/api/inventory.api';
import type {
  Block,
  Room,
  Bed,
  InventoryPage,
} from '../../inventory/api/inventory.api';
export interface BedChoice {
  id: string;
  label: string;
}
export default function AvailableBedPicker({
  uid,
  chosen,
  choose,
  denied,
}: {
  uid: string;
  chosen: BedChoice | null;
  choose: (bed: BedChoice | null) => void;
  denied: (reason: unknown) => void;
}) {
  const [block, setBlock] = useState<Block | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: InventoryPage<Block | Room | Bed>;
    error?: string;
  }>();
  const kind = room ? 'beds' : block ? 'rooms' : 'blocks';
  const parent = room?.room_id ?? block?.block_id;
  const key = `${uid}:${kind}:${parent}:${offset}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    listInventory(kind, uid, controller.signal, offset, parent)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (
          (error instanceof AuthorizedRequestError &&
            error.kind === 'session') ||
          (error instanceof InventoryError && error.kind === 'forbidden')
        )
          denied(error);
        else
          setResult({
            key,
            error: 'Inventory unavailable. Retry loading this page.',
          });
      });
    return () => controller.abort();
  }, [uid, kind, parent, offset, key, denied]);
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  function reset() {
    choose(null);
    setOffset(0);
  }
  return (
    <fieldset className="allocation-picker">
      <legend>Choose an available bed</legend>
      <p>
        {block ? `Block: ${block.name}` : 'Select a block'}
        {room ? ` · Room: ${room.room_no}` : ''}
      </p>
      <div className="student-form-actions">
        {block && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              setBlock(null);
              setRoom(null);
            }}
          >
            Change block
          </Button>
        )}
        {room && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              setRoom(null);
            }}
          >
            Change room
          </Button>
        )}
      </div>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry inventory
          </Button>
        </>
      ) : !data ? (
        <p role="status">Loading {kind}…</p>
      ) : (
        <>
          {!data.items.length && (
            <p role="status">
              {kind === 'beds'
                ? 'No available beds on this page.'
                : `No ${kind} on this page.`}
            </p>
          )}
          <ul className="allocation-options">
            {data.items.map((item) => {
              if ('bed_id' in item)
                return (
                  <li key={item.bed_id}>
                    <Button
                      size="sm"
                      variant={
                        chosen?.id === item.bed_id ? 'accent' : 'secondary'
                      }
                      aria-pressed={chosen?.id === item.bed_id}
                      onClick={() =>
                        choose({
                          id: item.bed_id,
                          label: `${block!.name} / Room ${room!.room_no} / Bed ${item.bed_no}`,
                        })
                      }
                    >
                      Select bed {item.bed_no}
                    </Button>
                    <span className="student-id">{item.bed_id}</span>
                  </li>
                );
              if ('room_id' in item)
                return (
                  <li key={item.room_id}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        reset();
                        setRoom(item);
                      }}
                    >
                      Room {item.room_no}
                    </Button>
                  </li>
                );
              return (
                <li key={item.block_id}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      reset();
                      setBlock(item);
                    }}
                  >
                    {item.name}
                  </Button>
                </li>
              );
            })}
          </ul>
          <nav className="student-pagination" aria-label="Inventory pagination">
            <Button
              size="sm"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => {
                choose(null);
                setOffset((value) => Math.max(0, value - 20));
              }}
            >
              Previous inventory page
            </Button>
            <span>Page {Math.floor(offset / 20) + 1}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={offset + 20 >= data.total}
              onClick={() => {
                choose(null);
                setOffset((value) => value + 20);
              }}
            >
              Next inventory page
            </Button>
          </nav>
        </>
      )}
    </fieldset>
  );
}
