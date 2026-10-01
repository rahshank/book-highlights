// @vitest-environment node
import { beforeEach, afterEach, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleRequest } from "./index";
import { authRoute } from "./auth";
import { digest, type WorkerEnv } from "./types";
import { push, pull, mergeRecord, type Operation } from "./sync";
import { scan } from "./ocr";
import { lookupIsbn } from "./isbn";
let sql: DatabaseSync, env: WorkerEnv;
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  for (const f of ["0001_initial.sql", "0002_private_sync.sql"])
    sql.exec(readFileSync("worker/migrations/" + f, "utf8"));
  const prepare = (query: string) => {
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        args = values;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...(args as never[])) ?? null;
      },
      async all() {
        return { results: sql.prepare(query).all(...(args as never[])) };
      },
      async run() {
        return sql.prepare(query).run(...(args as never[]));
      },
    };
  };
  const objects = new Map();
  env = {
    OWNER_EMAIL: "reader@example.test",
    RESEND_API_KEY: "test",
    OPENAI_API_KEY: "test",
    DB: {
      prepare,
      batch: async (items: Array<{ run: () => Promise<unknown> }>) => {
        sql.exec("begin");
        try {
          const out = [];
          for (const item of items) out.push(await item.run());
          sql.exec("commit");
          return out;
        } catch (e) {
          sql.exec("rollback");
          throw e;
        }
      },
    },
    SCAN_IMAGES: {
      put: async (k: string, v: unknown) => objects.set(k, v),
      get: async (k: string) => objects.get(k),
    },
  } as unknown as WorkerEnv;
});
afterEach(() => sql.close());
const post = (path: string, body: unknown) =>
  new Request("https://book.test" + path, {
    method: "POST",
    headers: {
      Origin: "https://book.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const op = (id: string, title: string): Operation => ({
  id: "op-" + id,
  entity: "book",
  entityId: id,
  action: "upsert",
  payload: {
    id,
    title,
    author: "Author",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
    deletedAt: null,
    version: 1,
  },
});
it("fails closed without credentials, rejects cross-origin mutations and never accepts legacy client tokens", async () => {
  expect(
    (await handleRequest(new Request("https://book.test/api/sync/pull"), env))
      .status,
  ).toBe(401);
  const request = post("/api/sync/push", { operations: [] });
  request.headers.set("Origin", "https://evil.test");
  expect((await handleRequest(request, env)).status).toBe(403);
  const legacy = post("/api/sync/push", { operations: [] });
  legacy.headers.set("Authorization", "Bearer secret-token");
  expect((await handleRequest(legacy, env)).status).toBe(401);
});
it("email codes are owner-only, single-use, expire and stop after five failures", async () => {
  let code = "",
    sent = 0;
  const send = async (_url: unknown, init: RequestInit) => {
    sent++;
    code = JSON.parse(String(init.body)).text.match(/\b\d{8}\b/)[0];
    return new Response("{}");
  };
  const unknown = await authRoute(
    post("/api/auth/request", {}),
    env,
    { email: "stranger@example.test" },
    send as typeof fetch,
  );
  expect(unknown.status).toBe(200);
  expect(sent).toBe(0);
  const requested = await authRoute(
    post("/api/auth/request", {}),
    env,
    { email: env.OWNER_EMAIL },
    send as typeof fetch,
  );
  const { challengeId } = (await requested.json()) as { challengeId: string };
  const response = await authRoute(post("/api/auth/verify", {}), env, {
    challengeId,
    code,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toContain(
    "HttpOnly; SameSite=Strict",
  );
  expect(
    (await authRoute(post("/api/auth/verify", {}), env, { challengeId, code }))
      .status,
  ).toBe(401);
  const request = await authRoute(
    post("/api/auth/request", {}),
    env,
    { email: env.OWNER_EMAIL },
    send as typeof fetch,
  );
  const second = (await request.json()) as { challengeId: string };
  for (let i = 0; i < 5; i++)
    expect(
      (
        await authRoute(post("/api/auth/verify", {}), env, {
          challengeId: second.challengeId,
          code: "00000000" === code ? "11111111" : "00000000",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await authRoute(post("/api/auth/verify", {}), env, {
        challengeId: second.challengeId,
        code,
      })
    ).status,
  ).toBe(401);
  const third = (await (
    await authRoute(
      post("/api/auth/request", {}),
      env,
      { email: env.OWNER_EMAIL },
      send as typeof fetch,
    )
  ).json()) as { challengeId: string };
  sql
    .prepare("update auth_challenges set expires=? where id=?")
    .run(Date.now() - 1, third.challengeId);
  expect(
    (
      await authRoute(post("/api/auth/verify", {}), env, {
        challengeId: third.challengeId,
        code,
      })
    ).status,
  ).toBe(401);
});
it("sessions permit private requests and sign-out revokes them", async () => {
  sql
    .prepare("insert into auth_sessions values(?,?)")
    .run(await digest("testsession"), Date.now() + 10000);
  const request = new Request("https://book.test/api/sync/pull", {
    headers: { Cookie: "__Host-book-session=testsession" },
  });
  expect((await handleRequest(request, env)).status).toBe(200);
  const logout = post("/api/auth/logout", {});
  logout.headers.set("Cookie", "__Host-book-session=testsession");
  expect((await handleRequest(logout, env)).status).toBe(200);
  expect((await handleRequest(request, env)).status).toBe(401);
});
it("sync retries are idempotent and independent field edits survive stale snapshots", async () => {
  const first = op("book", "Original");
  await push(env, { operations: [first] });
  await push(env, { operations: [first] });
  const a = {
    ...first,
    id: "edit-a",
    changedFields: ["title"],
    payload: {
      ...first.payload,
      title: "New title",
      updatedAt: "2026-09-30T13:00:00.000Z",
    },
  };
  const b = {
    ...first,
    id: "edit-b",
    changedFields: ["author"],
    payload: {
      ...first.payload,
      author: "New author",
      updatedAt: "2026-09-30T14:00:00.000Z",
    },
  };
  await Promise.all([
    push(env, { operations: [a] }),
    push(env, { operations: [b] }),
  ]);
  const response = (await (await pull(env, "0")).json()) as {
    events: Array<{ payload: { title: string; author: string } }>;
  };
  expect(response.events).toHaveLength(3);
  expect(response.events.at(-1)?.payload).toMatchObject({
    title: "New title",
    author: "New author",
  });
  expect(
    mergeRecord(
      { ...a, action: "upsert" },
      { ...first.payload, deletedAt: "2026-09-30" },
      {},
    ).payload.deletedAt,
  ).toBe("2026-09-30");
});
it("integer cursors paginate simultaneous edits without omissions", async () => {
  for (let i = 0; i < 205; i++)
    await push(env, { operations: [op("b" + i, "Book " + i)] });
  const page = (await (await pull(env, "0")).json()) as {
    cursor: string;
    hasMore: boolean;
    events: unknown[];
  };
  expect(page.events).toHaveLength(200);
  expect(page.hasMore).toBe(true);
  const last = (await (await pull(env, page.cursor)).json()) as {
    events: unknown[];
    hasMore: boolean;
  };
  expect(last.events).toHaveLength(5);
  expect(last.hasMore).toBe(false);
});
it("photo extraction is reusable by scan id and keeps images private until successful extraction", async () => {
  const bytes = new Uint8Array(20);
  bytes.set([255, 216, 255]);
  const req = () =>
    new Request("https://book.test/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "X-Book-Id": "book",
        "X-Scan-Id": "scan",
      },
      body: bytes,
    });
  let calls = 0;
  const call = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  passages: [{ text: "Marked words", pageNumber: 3 }],
                  warning: "",
                }),
              },
            ],
          },
        ],
      }),
    );
  };
  expect((await scan(req(), env, call)).status).toBe(200);
  expect((await scan(req(), env, call)).status).toBe(200);
  expect(calls).toBe(1);
});
it("explains exhausted API credit without losing the retryable photo", async () => {
  const bytes = new Uint8Array(20);
  bytes.set([255, 216, 255]);
  const request = new Request("https://book.test/api/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      "X-Book-Id": "book",
      "X-Scan-Id": "unfunded",
    },
    body: bytes,
  });
  const result = await scan(
    request,
    env,
    async () =>
      new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), {
        status: 429,
      }),
  );
  expect(await result.json()).toMatchObject({
    error: expect.stringContaining("API credit"),
  });
  expect(sql.prepare("select * from scan_results").all()).toHaveLength(0);
});

it("ISBN lookup cannot be used to fetch arbitrary URLs", async () => {
  let calls = 0;
  const call = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        docs: [{ title: "A book", author_name: ["An author"] }],
      }),
    );
  };
  expect((await lookupIsbn("https://internal.test", call)).status).toBe(400);
  expect(calls).toBe(0);
  expect(
    await (await lookupIsbn("978-0-14-032872-1", call)).json(),
  ).toMatchObject({ title: "A book", author: "An author" });
});
