export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface WorkerEnv {
  DB: D1Database;
  APP_AUTH_TOKEN?: string;
}

interface PushOperation {
  id: string;
  entity: "book" | "highlight";
  entityId: string;
  action: "upsert" | "delete";
  payload: Record<string, unknown>;
}

interface PushBody {
  cursor: string;
  operations: PushOperation[];
}

export default {
  fetch: handleRequest,
};

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/sync/push") {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as PushBody;
    if (!Array.isArray(body.operations)) {
      return json({ error: "operations must be an array" }, 400);
    }

    for (const operation of body.operations) {
      await persistOperation(env.DB, operation);
      await env.DB
        .prepare(
          "insert into sync_events (id, operation_id, entity, entity_id, action, payload_json, client_cursor, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          operation.id,
          operation.entity,
          operation.entityId,
          operation.action,
          JSON.stringify(operation.payload),
          body.cursor,
          new Date().toISOString(),
        )
        .run();
    }

    return json({
      accepted: body.operations.length,
      cursor: makeCursor(),
    });
  }

  if (request.method === "GET" && url.pathname === "/api/sync/pull") {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const since = url.searchParams.get("since") ?? "";
    const result = await env.DB
      .prepare(
        `select id, operation_id, entity, entity_id, action, payload_json, created_at
         from sync_events
         where created_at > coalesce(?, '')
         order by created_at asc
         limit 500`,
      )
      .bind(since)
      .all();

    const events = result.results.map((row) => ({
        id: row.id,
        operationId: row.operation_id,
        entity: row.entity,
        entityId: row.entity_id,
        action: row.action,
        payload: parsePayload(row.payload_json),
        createdAt: row.created_at,
      }));

    return json({
      cursor: events.at(-1)?.createdAt ?? since,
      events,
    });
  }

  return json({ error: "Not found" }, 404);
}

function isAuthorized(request: Request, env: WorkerEnv): boolean {
  if (!env.APP_AUTH_TOKEN) return true;
  return request.headers.get("authorization") === `Bearer ${env.APP_AUTH_TOKEN}`;
}

async function persistOperation(db: D1Database, operation: PushOperation): Promise<void> {
  if (operation.action === "delete") {
    await persistDelete(db, operation);
    return;
  }

  if (operation.entity === "book") {
    await persistBook(db, operation.payload);
    return;
  }

  if (operation.entity === "highlight") {
    await persistHighlight(db, operation.payload);
  }
}

async function persistBook(db: D1Database, payload: Record<string, unknown>): Promise<void> {
  await db
    .prepare(
      `insert into books (
        id, title, author, isbn, cover_url, publisher, year, source, notes,
        created_at, updated_at, deleted_at, version
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        title = excluded.title,
        author = excluded.author,
        isbn = excluded.isbn,
        cover_url = excluded.cover_url,
        publisher = excluded.publisher,
        year = excluded.year,
        source = excluded.source,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        version = excluded.version`,
    )
    .bind(
      payload.id,
      payload.title,
      payload.author ?? "",
      payload.isbn ?? "",
      payload.coverUrl ?? "",
      payload.publisher ?? "",
      payload.year ?? "",
      payload.source ?? "manual",
      payload.notes ?? "",
      payload.createdAt,
      payload.updatedAt,
      payload.deletedAt ?? null,
      payload.version ?? 1,
    )
    .run();
}

async function persistHighlight(db: D1Database, payload: Record<string, unknown>): Promise<void> {
  await db
    .prepare(
      `insert into highlights (
        id, book_id, text, note, page_number, location, chapter, source, source_image,
        created_at, updated_at, deleted_at, version
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        book_id = excluded.book_id,
        text = excluded.text,
        note = excluded.note,
        page_number = excluded.page_number,
        location = excluded.location,
        chapter = excluded.chapter,
        source = excluded.source,
        source_image = excluded.source_image,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        version = excluded.version`,
    )
    .bind(
      payload.id,
      payload.bookId,
      payload.text,
      payload.note ?? "",
      payload.pageNumber ?? null,
      payload.location ?? "",
      payload.chapter ?? "",
      payload.source ?? "manual",
      payload.sourceImage ?? "",
      payload.createdAt,
      payload.updatedAt,
      payload.deletedAt ?? null,
      payload.version ?? 1,
    )
    .run();
}

async function persistDelete(db: D1Database, operation: PushOperation): Promise<void> {
  const table = operation.entity === "book" ? "books" : "highlights";
  await db
    .prepare(`update ${table} set deleted_at = ?, updated_at = ?, version = version + 1 where id = ?`)
    .bind(new Date().toISOString(), new Date().toISOString(), operation.entityId)
    .run();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function makeCursor(): string {
  return new Date().toISOString();
}
