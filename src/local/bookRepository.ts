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
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError: string;
  writeOrder: number;
}

export interface LocalSyncState {
  id: "default";
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

interface BookHighlightsDatabase extends Dexie {
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
    writeOrder: ++localWriteSequence,
  };

  await db.transaction("rw", db.books, db.outbox, async () => {
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
    writeOrder: ++localWriteSequence,
  };

  await db.transaction("rw", db.highlights, db.outbox, async () => {
    await db.highlights.add(highlight);
    await enqueueOutboxOperation({
      entity: "highlight",
      entityId: highlight.id,
      action: "upsert",
      payload: highlight,
    });
  });
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

export async function searchHighlights(query: string): Promise<HighlightSearchResult[]> {
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

export async function getPendingOutboxOperations(): Promise<LocalOutboxOperation[]> {
  const operations = await db.outbox
    .filter((operation) => operation.status === "pending" || operation.status === "failed")
    .toArray();

  return operations.sort((a, b) => a.writeOrder - b.writeOrder);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const pendingCount = await db.outbox
    .filter((operation) => operation.status === "pending" || operation.status === "failed")
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

async function findBookByTitleAuthor(title: string, author: string): Promise<LocalBook | undefined> {
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
}): Promise<LocalOutboxOperation> {
  const now = new Date().toISOString();
  const operation: LocalOutboxOperation = {
    id: crypto.randomUUID(),
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    status: "pending",
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    lastError: "",
    writeOrder: ++localWriteSequence,
  };

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
