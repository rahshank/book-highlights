import { describe, expect, it } from "vitest";
import { handleRequest, type WorkerEnv } from "./index";

class FakeStatement {
  constructor(
    private readonly query: string,
    private readonly calls: string[],
    private readonly rows: Record<string, unknown>[] = [],
  ) {}

  bind(): FakeStatement {
    return this;
  }

  async run(): Promise<{ success: true }> {
    this.calls.push(this.query);
    return { success: true };
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    this.calls.push(this.query);
    return { results: this.rows };
  }
}

function createEnv(rows: Record<string, unknown>[] = []): WorkerEnv & { calls: string[] } {
  const calls: string[] = [];
  return {
    APP_AUTH_TOKEN: "secret-token",
    calls,
    DB: {
      prepare(query: string) {
        return new FakeStatement(query, calls, rows);
      },
    },
  };
}

describe("Cloudflare Worker API", () => {
  it("serves a health response", async () => {
    const response = await handleRequest(new Request("https://book.example/api/health"), createEnv());

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
  });

  it("rejects sync pushes without the app auth token", async () => {
    const response = await handleRequest(
      new Request("https://book.example/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ cursor: "", operations: [] }),
      }),
      createEnv(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("persists pushed operations and returns a new cursor", async () => {
    const env = createEnv();
    const response = await handleRequest(
      new Request("https://book.example/api/sync/push", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          cursor: "",
          operations: [
            {
              id: "operation-1",
              entity: "book",
              entityId: "book-1",
              action: "upsert",
              payload: {
                id: "book-1",
                title: "The Wretched of the Earth",
                author: "Frantz Fanon",
                source: "manual",
                createdAt: "2026-07-05T18:00:00.000Z",
                updatedAt: "2026-07-05T18:00:00.000Z",
                deletedAt: null,
                version: 1,
              },
            },
          ],
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cursor: expect.stringMatching(/^20\d\d-\d\d-\d\dT/),
      accepted: 1,
    });
    expect(env.calls).toEqual([
      expect.stringContaining("insert into books"),
      expect.stringContaining("insert into sync_events"),
    ]);
  });

  it("returns sync changes after a cursor", async () => {
    const env = createEnv([
      {
        id: "event-1",
        operation_id: "operation-1",
        entity: "book",
        entity_id: "book-1",
        action: "upsert",
        payload_json: JSON.stringify({ id: "book-1", title: "The Wretched of the Earth" }),
        created_at: "2026-07-05T18:00:00.000Z",
      },
    ]);
    const response = await handleRequest(
      new Request("https://book.example/api/sync/pull?since=cursor-1", {
        headers: { authorization: "Bearer secret-token" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cursor: "2026-07-05T18:00:00.000Z",
      events: [
        {
          id: "event-1",
          operationId: "operation-1",
          entity: "book",
          entityId: "book-1",
          action: "upsert",
          payload: { id: "book-1", title: "The Wretched of the Earth" },
          createdAt: "2026-07-05T18:00:00.000Z",
        },
      ],
    });
    expect(env.calls).toEqual([expect.stringContaining("from sync_events")]);
  });
});
