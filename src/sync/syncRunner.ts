import {
  getPendingOutboxOperations,
  getSyncStatus,
  markOutboxOperationsFailed,
  markOutboxOperationsSynced,
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
}

export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  pull?(request: SyncPullRequest): Promise<SyncPullResponse>;
}

export type SyncRunResult =
  | { status: "idle"; pushed: 0; cursor: string }
  | { status: "synced"; pushed: number; cursor: string }
  | { status: "failed"; pushed: 0; cursor: string; error: string };

export async function syncPendingChanges(transport: SyncTransport): Promise<SyncRunResult> {
  const status = await getSyncStatus();
  const operations = await getPendingOutboxOperations();

  if (operations.length === 0) {
    return {
      status: "idle",
      pushed: 0,
      cursor: status.cursor,
    };
  }

  try {
    const response = await transport.push({
      cursor: status.cursor,
      operations,
    });
    await markOutboxOperationsSynced(
      operations.map((operation) => operation.id),
      response.cursor,
    );

    return {
      status: "synced",
      pushed: operations.length,
      cursor: response.cursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await markOutboxOperationsFailed(
      operations.map((operation) => operation.id),
      message,
    );

    return {
      status: "failed",
      pushed: 0,
      cursor: status.cursor,
      error: message,
    };
  }
}
