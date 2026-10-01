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

it("pulls remote records even with no pending writes and never skips them after a push", async () => {
  await resetLocalDatabase();
  const pull = vi.fn().mockResolvedValue({
    cursor: "2",
    events: [
      {
        entity: "book",
        payload: {
          id: "remote",
          title: "Remote",
          author: "",
          deletedAt: null,
          createdAt: "2026-09-30",
          updatedAt: "2026-09-30",
          version: 1,
          writeOrder: 1,
        },
      },
    ],
  });
  await syncPendingChanges({ push: vi.fn(), pull });
  expect(pull).toHaveBeenCalledWith({ cursor: "" });
  const { exportLibrary } = await import("../local/bookRepository");
  expect((await exportLibrary()).books[0].title).toBe("Remote");
  await addBook({ title: "Local" });
  pull.mockResolvedValue({ cursor: "3", events: [] });
  await syncPendingChanges({
    push: vi.fn().mockResolvedValue({ cursor: "99" }),
    pull,
  });
  expect(pull).toHaveBeenLastCalledWith({ cursor: "2" });
});

it("does not restore private records after sign-out cancels an in-flight pull", async () => {
  await resetLocalDatabase();
  let active = true;
  const pull = vi.fn(async () => {
    active = false;
    await resetLocalDatabase();
    return {
      cursor: "1",
      events: [
        {
          entity: "book",
          payload: { id: "private", title: "Private", deletedAt: null },
        },
      ],
    };
  });
  await syncPendingChanges({ push: vi.fn(), pull }, () => active);
  const { exportLibrary } = await import("../local/bookRepository");
  expect((await exportLibrary()).books).toEqual([]);
});

it("splits large multibyte offline edits below the request-byte cap", async () => {
  await resetLocalDatabase();
  const book = await addBook({ title: "Many highlights" });
  const { addHighlight } = await import("../local/bookRepository");
  for (let i = 0; i < 25; i++)
    await addHighlight({ bookId: book.id, text: "本".repeat(45000) + i });
  const push = vi.fn(async (request) => {
    expect(
      new TextEncoder().encode(JSON.stringify(request)).length,
    ).toBeLessThan(2 * 1024 * 1024);
    return { cursor: "0" };
  });
  expect(
    (
      await syncPendingChanges({
        push,
        pull: async () => ({ cursor: "0", events: [] }),
      })
    ).status,
  ).toBe("synced");
  expect(push.mock.calls.length).toBeGreaterThan(1);
});
