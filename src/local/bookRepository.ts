import { validateOperation } from "../shared/validation";
import Dexie, { type EntityTable } from "dexie";
import { parseNotebookPaste } from "../lib/notebook-parser";

export type BookSource = "manual" | "kindle" | "ocr";
export type OutboxEntity = "book" | "highlight";
export type OutboxAction = "upsert" | "delete";
export type OutboxStatus = "pending" | "syncing" | "failed" | "synced";

export interface LocalBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  coverUrl: string;
  publisher: string;
  year: string;
  source: BookSource;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  writeOrder: number;
}

export interface LocalHighlight {
  id: string;
  bookId: string;
  text: string;
  note: string;
  pageNumber: number | null;
  location: string;
  chapter: string;
  source: BookSource;
  sourceImage: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  writeOrder: number;
}

export interface HighlightSearchResult {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  highlightId: string;
  text: string;
  note: string;
  pageNumber: number | null;
}

export interface NotebookImportResult {
  bookId: string;
  createdBook: boolean;
  imported: number;
  skipped: number;
}

export interface LocalOutboxOperation {
  id: string;
  entity: OutboxEntity;
  entityId: string;
  action: OutboxAction;
  status: OutboxStatus;
  payload: LocalBook | LocalHighlight;
  changedFields?: string[];
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError: string;
  writeOrder: number;
}

export interface LocalSyncState {
  id: "default";
  locked?: boolean;
  cursor: string;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  updatedAt: string;
}

export interface SyncStatus {
  pendingCount: number;
  cursor: string;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
}

export interface LocalScan {
  id: string;
  bookId: string;
  image: Blob;
  createdAt: string;
  status: "pending" | "review" | "failed";
  error: string;
  passages: Array<{ text: string; pageNumber: number | null }>;
  warning: string;
}
interface BookHighlightsDatabase extends Dexie {
  scans: EntityTable<LocalScan, "id">;
  books: EntityTable<LocalBook, "id">;
  highlights: EntityTable<LocalHighlight, "id">;
  outbox: EntityTable<LocalOutboxOperation, "id">;
  syncState: EntityTable<LocalSyncState, "id">;
}

const db = new Dexie("bookHighlightsLocal") as BookHighlightsDatabase;
let localWriteSequence = 0;

db.version(1).stores({
  books: "id, title, author, source, updatedAt, deletedAt",
  highlights: "id, bookId, text, note, source, updatedAt, deletedAt",
});

db.version(2).stores({
  books: "id, title, author, source, updatedAt, deletedAt",
  highlights: "id, bookId, text, note, source, updatedAt, deletedAt",
  outbox: "id, status, entity, entityId, createdAt, writeOrder",
  syncState: "id",
});

db.version(3).stores({
  books: "id, title, author, source, updatedAt, deletedAt",
  highlights: "id, bookId, text, note, source, updatedAt, deletedAt",
  outbox: "id, status, entity, entityId, createdAt, writeOrder",
  syncState: "id",
  scans: "id, bookId, status, createdAt",
});

export async function resetLocalDatabase(): Promise<void> {
  await db.delete();
  localWriteSequence = 0;
  await db.open();
}

export async function addBook(input: {
  title: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  publisher?: string;
  year?: string;
  source?: BookSource;
  notes?: string;
}): Promise<LocalBook> {
  if (!input.title.trim()) throw new Error("Book title is required");
  const now = new Date().toISOString();
  const book: LocalBook = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    author: input.author?.trim() ?? "",
    isbn: input.isbn?.trim() ?? "",
    coverUrl: input.coverUrl?.trim() ?? "",
    publisher: input.publisher?.trim() ?? "",
    year: input.year?.trim() ?? "",
    source: input.source ?? "manual",
    notes: input.notes?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    writeOrder: Date.now() * 1000 + (++localWriteSequence % 1000),
  };

  await db.transaction("rw", db.books, db.outbox, db.syncState, async () => {
    await db.books.add(book);
    await enqueueOutboxOperation({
      entity: "book",
      entityId: book.id,
      action: "upsert",
      payload: book,
    });
  });
  return book;
}

export async function addHighlight(input: {
  bookId: string;
  text: string;
  note?: string;
  pageNumber?: number | null;
  location?: string;
  chapter?: string;
  source?: BookSource;
  sourceImage?: string;
}): Promise<LocalHighlight> {
  if (!input.text.trim()) throw new Error("Highlight text is required");
  const book = await db.books.get(input.bookId);
  if (!book || book.deletedAt) {
    throw new Error("Book not found");
  }

  const now = new Date().toISOString();
  const highlight: LocalHighlight = {
    id: crypto.randomUUID(),
    bookId: input.bookId,
    text: input.text.trim(),
    note: input.note?.trim() ?? "",
    pageNumber: input.pageNumber ?? null,
    location: input.location?.trim() ?? "",
    chapter: input.chapter?.trim() ?? "",
    source: input.source ?? "manual",
    sourceImage: input.sourceImage?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    writeOrder: Date.now() * 1000 + (++localWriteSequence % 1000),
  };

  await db.transaction(
    "rw",
    db.highlights,
    db.books,
    db.outbox,
    db.syncState,
    async () => {
      await assertLocalWritable();
      const parent = await db.books.get(input.bookId);
      if (!parent || parent.deletedAt) throw new Error("Book not found");
      await db.highlights.add(highlight);
      await enqueueOutboxOperation({
        entity: "highlight",
        entityId: highlight.id,
        action: "upsert",
        payload: highlight,
      });
    },
  );
  return highlight;
}

export async function importNotebookPaste(input: {
  paste: string;
  titleOverride?: string;
  authorOverride?: string;
}): Promise<NotebookImportResult> {
  const parsed = parseNotebookPaste(
    input.paste,
    input.titleOverride?.trim() ?? "",
    input.authorOverride?.trim() ?? "",
  );
  const title = parsed.title.trim();
  const author = parsed.author.trim();

  if (!title) {
    throw new Error("Book title is required");
  }

  let book = await findBookByTitleAuthor(title, author);
  const createdBook = !book;

  if (!book) {
    book = await addBook({ title, author, source: "kindle" });
  }

  let imported = 0;
  let skipped = 0;

  for (const highlight of parsed.highlights) {
    const exists = await hasMatchingHighlight({
      bookId: book.id,
      text: highlight.text,
      location: highlight.location,
      pageNumber: highlight.page,
    });

    if (exists) {
      skipped += 1;
      continue;
    }

    await addHighlight({
      bookId: book.id,
      text: highlight.text,
      note: highlight.note,
      pageNumber: highlight.page,
      location: highlight.location,
      source: "kindle",
    });
    imported += 1;
  }

  return {
    bookId: book.id,
    createdBook,
    imported,
    skipped,
  };
}

export async function searchHighlights(
  query: string,
): Promise<HighlightSearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const highlights = await db.highlights
    .filter((highlight) => highlight.deletedAt === null)
    .toArray();

  const matches = highlights.filter((highlight) => {
    const haystack = `${highlight.text}\n${highlight.note}`.toLowerCase();
    return haystack.includes(normalized);
  });

  const results: HighlightSearchResult[] = [];
  for (const highlight of matches) {
    const book = await db.books.get(highlight.bookId);
    if (!book || book.deletedAt) continue;
    results.push({
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      highlightId: highlight.id,
      text: highlight.text,
      note: highlight.note,
      pageNumber: highlight.pageNumber,
    });
  }

  return results;
}

export async function getPendingOutboxOperations(): Promise<
  LocalOutboxOperation[]
> {
  const operations = await db.outbox
    .filter(
      (operation) =>
        operation.status === "pending" || operation.status === "failed",
    )
    .toArray();

  return operations.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.writeOrder - b.writeOrder,
  );
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const pendingCount = await db.outbox
    .filter(
      (operation) =>
        operation.status === "pending" || operation.status === "failed",
    )
    .count();
  const syncState = await getOrCreateSyncState();

  return {
    pendingCount,
    cursor: syncState.cursor,
    lastSyncedAt: syncState.lastSyncedAt,
    lastAttemptedAt: syncState.lastAttemptedAt,
  };
}

export async function markOutboxOperationsSynced(
  operationIds: string[],
  cursor: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction("rw", db.outbox, db.syncState, async () => {
    if (await isLocalLocked()) return;
    await Promise.all(
      operationIds.map((id) =>
        db.outbox.update(id, {
          status: "synced",
          updatedAt: now,
          lastError: "",
        }),
      ),
    );
    await db.syncState.put({
      id: "default",
      cursor,
      lastSyncedAt: now,
      lastAttemptedAt: now,
      updatedAt: now,
    });
  });
}

export async function markOutboxOperationsFailed(
  operationIds: string[],
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction("rw", db.outbox, db.syncState, async () => {
    if (await isLocalLocked()) return;
    await Promise.all(
      operationIds.map(async (id) => {
        const operation = await db.outbox.get(id);
        if (!operation) return;

        await db.outbox.update(id, {
          status: "failed",
          updatedAt: now,
          attemptCount: operation.attemptCount + 1,
          lastError: errorMessage,
        });
      }),
    );

    const current = await getOrCreateSyncState();
    await db.syncState.put({
      ...current,
      lastAttemptedAt: now,
      updatedAt: now,
    });
  });
}

async function findBookByTitleAuthor(
  title: string,
  author: string,
): Promise<LocalBook | undefined> {
  const normalizedTitle = normalizeComparable(title);
  const normalizedAuthor = normalizeComparable(author);

  return db.books
    .filter(
      (book) =>
        book.deletedAt === null &&
        normalizeComparable(book.title) === normalizedTitle &&
        normalizeComparable(book.author) === normalizedAuthor,
    )
    .first();
}

async function hasMatchingHighlight(input: {
  bookId: string;
  text: string;
  location: string;
  pageNumber: number | null;
}): Promise<boolean> {
  const normalizedText = normalizeComparable(input.text);
  const normalizedLocation = input.location.trim();

  const match = await db.highlights
    .where("bookId")
    .equals(input.bookId)
    .and(
      (highlight) =>
        highlight.deletedAt === null &&
        normalizeComparable(highlight.text) === normalizedText &&
        highlight.location.trim() === normalizedLocation &&
        highlight.pageNumber === input.pageNumber,
    )
    .first();

  return Boolean(match);
}

function normalizeComparable(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function enqueueOutboxOperation(input: {
  entity: OutboxEntity;
  entityId: string;
  action: OutboxAction;
  payload: LocalBook | LocalHighlight;
  changedFields?: string[];
}): Promise<LocalOutboxOperation> {
  const now = new Date().toISOString();
  const operation: LocalOutboxOperation = {
    id: crypto.randomUUID(),
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    status: "pending",
    payload: input.payload,
    changedFields: input.changedFields,
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    lastError: "",
    writeOrder: Date.now() * 1000 + (++localWriteSequence % 1000),
  };

  await assertLocalWritable();
  validateOperation(operation);
  // A corrected record replaces old invalid snapshots without discarding its data.
  for (const old of await db.outbox
    .where("entityId")
    .equals(input.entityId)
    .toArray()) {
    if (old.status === "synced") continue;
    try {
      validateOperation(old);
    } catch {
      await db.outbox.delete(old.id);
      operation.changedFields = undefined;
    }
  }
  await db.outbox.add(operation);
  return operation;
}

async function getOrCreateSyncState(): Promise<LocalSyncState> {
  const existing = await db.syncState.get("default");
  if (existing) return existing;

  const now = new Date().toISOString();
  const syncState: LocalSyncState = {
    id: "default",
    cursor: "",
    lastSyncedAt: null,
    lastAttemptedAt: null,
    updatedAt: now,
  };
  await db.syncState.put(syncState);
  return syncState;
}

export async function exportLibrary(): Promise<{
  exportedAt: string;
  books: Array<LocalBook & { highlights: LocalHighlight[] }>;
}> {
  const books = await db.books
    .filter((book) => book.deletedAt === null)
    .sortBy("createdAt");

  const exportedBooks = [];
  for (const book of books) {
    const highlights = await db.highlights
      .where("bookId")
      .equals(book.id)
      .and((highlight) => highlight.deletedAt === null)
      .toArray();
    exportedBooks.push({
      ...book,
      highlights: highlights.sort((a, b) => a.writeOrder - b.writeOrder),
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    books: exportedBooks,
  };
}

export async function updateBook(
  id: string,
  patch: Partial<
    Pick<
      LocalBook,
      "title" | "author" | "notes" | "isbn" | "publisher" | "year"
    >
  >,
) {
  if (patch.title !== undefined && !patch.title.trim())
    throw new Error("Book title is required");
  return editRecord("book", id, patch);
}
export async function updateHighlight(
  id: string,
  patch: Partial<
    Pick<LocalHighlight, "text" | "note" | "pageNumber" | "chapter">
  >,
) {
  if (patch.text !== undefined && !patch.text.trim())
    throw new Error("Highlight text is required");
  return editRecord("highlight", id, patch);
}
async function editRecord(
  entity: OutboxEntity,
  id: string,
  patch: Record<string, unknown>,
) {
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.syncState,
    async () => {
      const table = entity === "book" ? db.books : db.highlights;
      const current = await table.get(id);
      if (!current || current.deletedAt)
        throw new Error("This item no longer exists");
      const record = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
        version: current.version + 1,
      };
      await (table as EntityTable<LocalBook | LocalHighlight, "id">).put(
        record,
      );
      await enqueueOutboxOperation({
        entity,
        entityId: id,
        action: patch.deletedAt ? "delete" : "upsert",
        payload: record,
        changedFields: Object.keys(patch),
      });
    },
  );
}
export async function deleteHighlight(id: string) {
  await editRecord("highlight", id, { deletedAt: new Date().toISOString() });
}
export async function deleteBook(id: string) {
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.scans,
    db.syncState,
    async () => {
      for (const h of await db.highlights.where("bookId").equals(id).toArray())
        if (!h.deletedAt) await deleteHighlight(h.id);
      await editRecord("book", id, { deletedAt: new Date().toISOString() });
      await db.scans.where("bookId").equals(id).delete();
    },
  );
}
export async function applyRemoteEvents(
  events: Array<{ entity: string; payload: Record<string, unknown> }>,
  cursor: string,
) {
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.syncState,
    async () => {
      if (await isLocalLocked()) return;
      const pending = await getPendingOutboxOperations();
      for (const event of events) {
        if (
          !["book", "highlight"].includes(event.entity) ||
          typeof event.payload.id !== "string"
        )
          throw new Error("Invalid sync response");
        const table = (
          event.entity === "book" ? db.books : db.highlights
        ) as EntityTable<LocalBook | LocalHighlight, "id">;
        const remote = { ...event.payload } as unknown as
          LocalBook | LocalHighlight;
        // Pending edits overlay only touched fields. Unrelated changes still arrive.
        if (!remote.deletedAt)
          for (const op of pending.filter(
            (o) => o.entity === event.entity && o.entityId === remote.id,
          )) {
            for (const field of op.changedFields ?? Object.keys(op.payload))
              if (!["version", "createdAt"].includes(field))
                Object.assign(remote, {
                  [field]: (op.payload as unknown as Record<string, unknown>)[
                    field
                  ],
                });
          }
        await table.put(remote);
      }
      const state = await getOrCreateSyncState();
      await db.syncState.put({
        ...state,
        cursor,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
  );
}
export async function addScan(bookId: string, image: Blob) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
    image.size > 8 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG or WebP image smaller than 8 MB.");
  const scan: LocalScan = {
    id: crypto.randomUUID(),
    bookId,
    image,
    createdAt: new Date().toISOString(),
    status: "pending",
    error: "",
    passages: [],
    warning: "",
  };
  await db.transaction("rw", db.scans, db.syncState, async () => {
    await assertLocalWritable();
    await db.scans.add(scan);
  });
  return scan;
}
export async function listScans(bookId?: string) {
  const all = await db.scans.toArray();
  return all.filter((s) => !bookId || s.bookId === bookId);
}
export async function updateScan(
  id: string,
  patch: Partial<Pick<LocalScan, "status" | "passages" | "warning" | "error">>,
) {
  await db.transaction("rw", db.scans, db.syncState, async () => {
    await assertLocalWritable();
    await db.scans.update(id, patch);
  });
}
export async function removeScan(id: string) {
  await db.transaction("rw", db.scans, db.syncState, async () => {
    await assertLocalWritable();
    await db.scans.delete(id);
  });
}
export async function saveScanHighlights(
  id: string,
  passages: Array<{ text: string; pageNumber: number | null }>,
) {
  await db.transaction(
    "rw",
    db.scans,
    db.books,
    db.highlights,
    db.outbox,
    db.syncState,
    async () => {
      const scan = await db.scans.get(id);
      if (!scan) throw new Error("Scan not found");
      for (const p of passages)
        if (p.text.trim())
          await addHighlight({
            bookId: scan.bookId,
            text: p.text,
            pageNumber: p.pageNumber,
            source: "ocr",
            sourceImage: id,
          });
      await db.scans.delete(id);
    },
  );
}

export async function importBackup(input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray((input as { books: unknown }).books)
  )
    throw new Error("Choose a Book Highlights JSON export.");
  const raw = (input as { books: unknown[] }).books;
  if (raw.length > 5000)
    throw new Error("This backup contains too many books.");
  // Validate and normalize everything before starting any writes. Accept old snake_case exports.
  const now = new Date().toISOString();
  const books = raw.map((value) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid book in backup");
    const b = value as Record<string, unknown>;
    if (
      typeof b.title !== "string" ||
      !b.title.trim() ||
      !Array.isArray(b.highlights)
    )
      throw new Error("Invalid book in backup");
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const id = text(b.id) || crypto.randomUUID();
    const book: LocalBook = {
      id,
      title: b.title,
      author: text(b.author),
      isbn: text(b.isbn),
      coverUrl: text(b.coverUrl ?? b.cover_url),
      publisher: text(b.publisher),
      year: text(b.year),
      source: ["manual", "kindle", "ocr"].includes(text(b.source))
        ? (text(b.source) as BookSource)
        : "manual",
      notes: text(b.notes),
      createdAt: text(b.createdAt ?? b.created_at) || now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      writeOrder: Date.now() * 1000,
    };
    const highlights = b.highlights.map((value) => {
      if (!value || typeof value !== "object")
        throw new Error("Invalid highlight in backup");
      const h = value as Record<string, unknown>;
      if (typeof h.text !== "string" || !h.text.trim())
        throw new Error("Invalid highlight text in backup");
      const page = h.pageNumber ?? h.page_number;
      return {
        id: text(h.id) || crypto.randomUUID(),
        bookId: id,
        text: h.text,
        note: text(h.note),
        pageNumber:
          typeof page === "number" && Number.isInteger(page) && page > 0
            ? page
            : null,
        location: text(h.location),
        chapter: text(h.chapter),
        source: ["manual", "kindle", "ocr"].includes(text(h.source))
          ? (text(h.source) as BookSource)
          : "manual",
        sourceImage: /^[\w-]{1,128}$/.test(text(h.sourceImage))
          ? text(h.sourceImage)
          : "",
        createdAt: text(h.createdAt ?? h.created_at) || now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        writeOrder: Date.now() * 1000,
      } as LocalHighlight;
    });
    return { book, highlights };
  });
  let imported = 0;
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.syncState,
    async () => {
      for (const { book, highlights } of books) {
        if (!(await db.books.get(book.id))) {
          await db.books.add(book);
          await enqueueOutboxOperation({
            entity: "book",
            entityId: book.id,
            action: "upsert",
            payload: book,
          });
        }
        for (const h of highlights)
          if (
            !(await db.highlights.get(h.id)) &&
            !(await hasMatchingHighlight(h))
          ) {
            await db.highlights.add(h);
            await enqueueOutboxOperation({
              entity: "highlight",
              entityId: h.id,
              action: "upsert",
              payload: h,
            });
            imported++;
          }
      }
    },
  );
  return imported;
}

export async function importClippings(content: string) {
  const { parseClippings, groupByBook } = await import("../lib/kindle-parser");
  const groups = groupByBook(parseClippings(content));
  if (!groups.length)
    throw new Error("No Kindle clippings were found in this file.");
  let imported = 0,
    skipped = 0;
  for (const group of groups) {
    let book = await findBookByTitleAuthor(group.title, group.author);
    if (!book)
      book = await addBook({
        title: group.title,
        author: group.author,
        source: "kindle",
      });
    for (const clip of group.clippings.filter(
      (c) => c.clippingType === "highlight",
    )) {
      if (
        await hasMatchingHighlight({
          bookId: book.id,
          text: clip.text,
          location: clip.location,
          pageNumber: clip.page,
        })
      ) {
        skipped++;
        continue;
      }
      const note = group.clippings
        .filter(
          (c) => c.clippingType === "note" && c.location === clip.location,
        )
        .map((c) => c.text)
        .join("\n");
      await addHighlight({
        bookId: book.id,
        text: clip.text,
        note,
        pageNumber: clip.page,
        location: clip.location,
        source: "kindle",
      });
      imported++;
    }
  }
  return { imported, skipped };
}

async function assertLocalWritable() {
  if ((await db.syncState.get("default"))?.locked)
    throw new Error("Sign in again before making changes.");
}
export async function beginSignOut() {
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.scans,
    db.syncState,
    async () => {
      if (
        (await getPendingOutboxOperations()).length ||
        (await db.scans.count())
      )
        throw new Error(
          "Sync your changes and review or discard your photos before signing out. Export a backup from Library if needed.",
        );
      const state = await getOrCreateSyncState();
      await db.syncState.put({ ...state, locked: true });
    },
  );
}
export async function finishSignOut() {
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.scans,
    db.syncState,
    async () => {
      await assertSignOutLock();
      await db.books.clear();
      await db.highlights.clear();
      await db.outbox.clear();
      await db.scans.clear();
      await db.syncState.put({
        id: "default",
        cursor: "",
        lastSyncedAt: null,
        lastAttemptedAt: null,
        updatedAt: new Date().toISOString(),
        locked: true,
      });
    },
  );
}
async function assertSignOutLock() {
  if (!(await db.syncState.get("default"))?.locked)
    throw new Error("Sign-out was interrupted. Please retry.");
}
export async function unlockLocalDatabase() {
  await db.transaction("rw", db.syncState, async () => {
    const state = await getOrCreateSyncState();
    await db.syncState.put({ ...state, locked: false });
  });
}

export async function isLocalLocked() {
  return Boolean((await db.syncState.get("default"))?.locked);
}

// Repair identifiers accepted by early local builds; preserve every word and relationship.
export async function repairLegacyIdentifiers() {
  const valid = (v: string) => /^[\w-]{1,128}$/.test(v);
  const pending = await getPendingOutboxOperations();
  if (
    !pending.some(
      (o) =>
        !valid(o.id) ||
        !valid(o.entityId) ||
        (o.entity === "highlight" &&
          !valid((o.payload as LocalHighlight).bookId)),
    )
  )
    return;
  await db.transaction(
    "rw",
    db.books,
    db.highlights,
    db.outbox,
    db.scans,
    db.syncState,
    async () => {
      await assertLocalWritable();
      const ids = new Map<string, string>();
      const normalized = (kind: string, id: string) => {
        if (valid(id)) return id;
        const key = kind + ":" + id;
        if (!ids.has(key)) ids.set(key, crypto.randomUUID());
        return ids.get(key)!;
      };
      for (const b of await db.books.toArray())
        if (!valid(b.id)) {
          await db.books.delete(b.id);
          await db.books.put({ ...b, id: normalized("book", b.id) });
        }
      for (const h of await db.highlights.toArray())
        if (!valid(h.id) || !valid(h.bookId)) {
          await db.highlights.delete(h.id);
          await db.highlights.put({
            ...h,
            id: normalized("highlight", h.id),
            bookId: normalized("book", h.bookId),
          });
        }
      for (const scan of await db.scans.toArray())
        if (!valid(scan.bookId))
          await db.scans.put({
            ...scan,
            bookId: normalized("book", scan.bookId),
          });
      for (const op of await db.outbox.toArray()) {
        const payload = {
          ...op.payload,
          id: normalized(op.entity, op.entityId),
        };
        if ("bookId" in payload)
          payload.bookId = normalized("book", payload.bookId);
        await db.outbox.delete(op.id);
        await db.outbox.put({
          ...op,
          id: valid(op.id) ? op.id : crypto.randomUUID(),
          entityId: payload.id,
          payload,
        });
      }
    },
  );
}
