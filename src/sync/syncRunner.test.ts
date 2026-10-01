import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addBook,
  getPendingOutboxOperations,
  getSyncStatus,
  resetLocalDatabase,
} from "../local/bookRepository";
import { syncPendingChanges } from "./syncRunner";

describe("sync runner", () => {
  beforeEach(async () => {
    await resetLocalDatabase();
  });

  it("does not call the transport when there are no pending operations", async () => {
    const push = vi.fn();

    await expect(syncPendingChanges({ push })).resolves.toEqual({
      pushed: 0,
      cursor: "",
      status: "idle",
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes pending operations and advances the local sync cursor", async () => {
    const book = await addBook({
      title: "The Wretched of the Earth",
      author: "Frantz Fanon",
    });
    const push = vi.fn().mockResolvedValue({ cursor: "cursor-2" });

    await expect(syncPendingChanges({ push })).resolves.toEqual({
      pushed: 1,
      cursor: "cursor-2",
      status: "synced",
    });

    expect(push).toHaveBeenCalledWith({
      cursor: "",
      operations: [
        expect.objectContaining({
          entity: "book",
          entityId: book.id,
          payload: expect.objectContaining({
            title: "The Wretched of the Earth",
          }),
        }),
      ],
    });
    await expect(getPendingOutboxOperations()).resolves.toEqual([]);
    await expect(getSyncStatus()).resolves.toMatchObject({
      pendingCount: 0,
      cursor: "cursor-2",
      lastSyncedAt: expect.any(String),
    });
  });

  it("keeps failed operations pending with the latest sync error", async () => {
    await addBook({
      title: "Black Skin, White Masks",
      author: "Frantz Fanon",
    });
    const push = vi.fn().mockRejectedValue(new Error("network offline"));

    await expect(syncPendingChanges({ push })).resolves.toEqual({
      pushed: 0,
      cursor: "",
      status: "failed",
      error: "network offline",
    });

    await expect(getPendingOutboxOperations()).resolves.toMatchObject([
      {
        status: "failed",
        attemptCount: 1,
        lastError: "network offline",
      },
    ]);
    await expect(getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      cursor: "",
      lastAttemptedAt: expect.any(String),
    });
  });
});
