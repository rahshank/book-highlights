import {
  getPendingOutboxOperations,
  getSyncStatus,
  markOutboxOperationsFailed,
  markOutboxOperationsSynced,
  applyRemoteEvents,
  type LocalOutboxOperation,
} from "../local/bookRepository";
export interface SyncPushRequest {
  cursor: string;
  operations: LocalOutboxOperation[];
}
export interface SyncPushResponse {
  cursor: string;
}
export interface SyncPullRequest {
  cursor: string;
}
export interface SyncPullResponse {
  cursor: string;
  events: Array<Record<string, unknown>>;
  hasMore?: boolean;
}
export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  pull?(request: SyncPullRequest): Promise<SyncPullResponse>;
}
export type SyncRunResult =
  | { status: "idle" | "synced"; pushed: number; cursor: string }
  | { status: "failed"; pushed: 0; cursor: string; error: string };
let running: Promise<SyncRunResult> | null = null;
export function syncPendingChanges(
  transport: SyncTransport,
  stillActive: () => boolean = () => true,
): Promise<SyncRunResult> {
  if (running) return running;
  const task = () => run(transport, stillActive);
  running = (async () =>
    typeof navigator !== "undefined" && navigator.locks
      ? await navigator.locks.request("book-highlights-sync", task)
      : await task())().finally(() => {
    running = null;
  });
  return running;
}
async function run(
  transport: SyncTransport,
  stillActive: () => boolean,
): Promise<SyncRunResult> {
  if (!stillActive()) return { status: "idle", pushed: 0, cursor: "" };
  const state = await getSyncStatus();
  const operations = await getPendingOutboxOperations();
  let cursor = state.cursor,
    pushed = 0;
  try {
    const check = () => {
      if (!stillActive()) throw new Error("Sync cancelled after sign-out");
    };
    for (let i = 0; i < operations.length; i += 50) {
      check();
      const batch = operations.slice(i, i + 50);
      const response = await transport.push({ cursor, operations: batch });
      check();
      // Push acknowledgements must never advance the pull cursor past unseen changes.
      await markOutboxOperationsSynced(
        batch.map((o) => o.id),
        transport.pull ? cursor : response.cursor,
      );
      pushed += batch.length;
      if (!transport.pull) cursor = response.cursor;
    }
    if (transport.pull) {
      let more = true;
      while (more) {
        check();
        const response = await transport.pull({ cursor });
        check();
        await applyRemoteEvents(
          response.events as Array<{
            entity: string;
            payload: Record<string, unknown>;
          }>,
          response.cursor,
        );
        if (response.hasMore && response.cursor === cursor)
          throw new Error("Sync did not advance. Please retry.");
        cursor = response.cursor;
        more = Boolean(response.hasMore);
      }
    }
    return {
      status: pushed || transport.pull ? "synced" : "idle",
      pushed,
      cursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    if (stillActive())
      await markOutboxOperationsFailed(
        operations.slice(pushed).map((o) => o.id),
        message,
      );
    return { status: "failed", pushed: 0, cursor, error: message };
  }
}
