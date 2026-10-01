import { describe, expect, it, vi } from "vitest";
import { createHttpSyncTransport } from "./httpSyncTransport";

describe("HTTP sync transport", () => {
  it("posts queued operations to the Worker sync endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cursor: "cursor-3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createHttpSyncTransport({
      apiBaseUrl: "https://book.example/",
      authToken: "secret-token",
      fetchImpl,
    });

    await expect(
      transport.push({
        cursor: "cursor-2",
        operations: [
          {
            id: "operation-1",
            entity: "book",
            entityId: "book-1",
            action: "upsert",
            status: "pending",
            payload: { id: "book-1", title: "A Book" } as never,
            createdAt: "2026-07-05T18:00:00.000Z",
            updatedAt: "2026-07-05T18:00:00.000Z",
            attemptCount: 0,
            lastError: "",
            writeOrder: 1,
          },
        ],
      }),
    ).resolves.toEqual({ cursor: "cursor-3" });

    expect(fetchImpl).toHaveBeenCalledWith("https://book.example/api/sync/push", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: expect.any(String),
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      cursor: "cursor-2",
      operations: [
        {
          id: "operation-1",
          entity: "book",
        },
      ],
    });
  });

  it("throws the Worker error when the push fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createHttpSyncTransport({
      apiBaseUrl: "https://book.example",
      authToken: "wrong-token",
      fetchImpl,
    });

    await expect(transport.push({ cursor: "", operations: [] })).rejects.toThrow("Unauthorized");
  });

  it("pulls remote sync events from the Worker", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: "cursor-4",
          events: [{ id: "event-1", entity: "book", entityId: "book-1" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const transport = createHttpSyncTransport({
      apiBaseUrl: "https://book.example",
      authToken: "secret-token",
      fetchImpl,
    });

    expect(transport.pull).toBeDefined();
    await expect(transport.pull!({ cursor: "cursor-3" })).resolves.toEqual({
      cursor: "cursor-4",
      events: [{ id: "event-1", entity: "book", entityId: "book-1" }],
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://book.example/api/sync/pull?since=cursor-3", {
      method: "GET",
      headers: {
        authorization: "Bearer secret-token",
      },
    });
  });
});
