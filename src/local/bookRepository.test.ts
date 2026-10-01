import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addBook,
  addHighlight,
  exportLibrary,
  getPendingOutboxOperations,
  getSyncStatus,
  importNotebookPaste,
  markOutboxOperationsSynced,
  resetLocalDatabase,
  searchHighlights,
} from "./bookRepository";

describe("local book repository", () => {
  beforeEach(async () => {
    await resetLocalDatabase();
  });

  it("stores books and highlights locally, searches them, and exports nested JSON", async () => {
    const book = await addBook({
      title: "The Great Transformation",
      author: "Karl Polanyi",
      source: "manual",
    });

    const highlight = await addHighlight({
      bookId: book.id,
      text: "Laissez-faire was planned; planning was not.",
      note: "Useful line for markets essay.",
      pageNumber: 147,
      source: "manual",
    });

    await addHighlight({
      bookId: book.id,
      text: "The market economy was a threat to the human and natural substance of society.",
      source: "kindle",
    });

    const results = await searchHighlights("markets essay");
    expect(results).toEqual([
      {
        bookId: book.id,
        bookTitle: "The Great Transformation",
        bookAuthor: "Karl Polanyi",
        highlightId: highlight.id,
        text: "Laissez-faire was planned; planning was not.",
        note: "Useful line for markets essay.",
        pageNumber: 147,
      },
    ]);

    await expect(exportLibrary()).resolves.toMatchObject({
      books: [
        {
          id: book.id,
          title: "The Great Transformation",
          author: "Karl Polanyi",
          highlights: [
            {
              id: highlight.id,
              text: "Laissez-faire was planned; planning was not.",
              note: "Useful line for markets essay.",
              pageNumber: 147,
            },
            {
              text: "The market economy was a threat to the human and natural substance of society.",
              source: "kindle",
            },
          ],
        },
      ],
    });
  });

  it("imports Kindle notebook paste locally and skips duplicate highlights on repeat imports", async () => {
    const paste = `
The Great Transformation
Karl Polanyi

Yellow highlight | Location: 150
Laissez-faire was planned; planning was not.

Note | Location: 150
Useful line for markets essay.

Yellow highlight | Page: 212
The market economy was a threat to society.
`;

    await expect(importNotebookPaste({ paste })).resolves.toEqual({
      bookId: expect.any(String),
      createdBook: true,
      imported: 2,
      skipped: 0,
    });

    await expect(importNotebookPaste({ paste })).resolves.toEqual({
      bookId: expect.any(String),
      createdBook: false,
      imported: 0,
      skipped: 2,
    });

    await expect(exportLibrary()).resolves.toMatchObject({
      books: [
        {
          title: "The Great Transformation",
          author: "Karl Polanyi",
          source: "kindle",
          highlights: [
            {
              text: "Laissez-faire was planned; planning was not.",
              note: "Useful line for markets essay.",
              location: "150",
              source: "kindle",
            },
            {
              text: "The market economy was a threat to society.",
              pageNumber: 212,
              source: "kindle",
            },
          ],
        },
      ],
    });
  });

  it("queues local book and highlight writes for automatic sync", async () => {
    const book = await addBook({
      title: "Notebook of a Return to the Native Land",
      author: "Aime Cesaire",
      source: "manual",
    });
    const highlight = await addHighlight({
      bookId: book.id,
      text: "My mouth shall be the mouth of those calamities that have no mouth.",
      source: "manual",
    });

    await expect(getPendingOutboxOperations()).resolves.toMatchObject([
      {
        entity: "book",
        entityId: book.id,
        action: "upsert",
        status: "pending",
        payload: {
          id: book.id,
          title: "Notebook of a Return to the Native Land",
        },
      },
      {
        entity: "highlight",
        entityId: highlight.id,
        action: "upsert",
        status: "pending",
        payload: {
          id: highlight.id,
          bookId: book.id,
          text: "My mouth shall be the mouth of those calamities that have no mouth.",
        },
      },
    ]);

    await expect(getSyncStatus()).resolves.toMatchObject({
      pendingCount: 2,
      lastSyncedAt: null,
      cursor: "",
    });

    const pending = await getPendingOutboxOperations();
    await markOutboxOperationsSynced(
      pending.map((operation) => operation.id),
      "server-cursor-1",
    );

    await expect(getPendingOutboxOperations()).resolves.toEqual([]);
    await expect(getSyncStatus()).resolves.toMatchObject({
      pendingCount: 0,
      cursor: "server-cursor-1",
      lastSyncedAt: expect.any(String),
    });
  });

  it("does not queue sync operations for duplicate Kindle import highlights", async () => {
    const paste = `
The Great Transformation
Karl Polanyi

Yellow highlight | Location: 150
Laissez-faire was planned; planning was not.
`;

    await importNotebookPaste({ paste });
    await expect(getSyncStatus()).resolves.toMatchObject({ pendingCount: 2 });

    await importNotebookPaste({ paste });
    await expect(getPendingOutboxOperations()).resolves.toHaveLength(2);
  });
});
