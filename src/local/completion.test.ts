import { beforeEach, it, expect } from "vitest";
import * as repo from "./bookRepository";
beforeEach(() => repo.resetLocalDatabase());
it("edits and tombstones books/highlights atomically with pending operations", async () => {
  const b = await repo.addBook({ title: "A book" });
  const h = await repo.addHighlight({ bookId: b.id, text: "A passage" });
  await repo.updateBook(b.id, { notes: "My notes" });
  await repo.updateHighlight(h.id, { note: "My thought" });
  expect((await repo.exportLibrary()).books[0].highlights[0].note).toBe(
    "My thought",
  );
  await repo.deleteBook(b.id);
  expect((await repo.exportLibrary()).books).toHaveLength(0);
  expect(
    (await repo.getPendingOutboxOperations()).filter(
      (x) => x.action === "delete",
    ),
  ).toHaveLength(2);
});
it("pull merges remote changes while preserving only locally edited fields", async () => {
  const b = await repo.addBook({ title: "A book", author: "An author" });
  await repo.markOutboxOperationsSynced(
    (await repo.getPendingOutboxOperations()).map((x) => x.id),
    "0",
  );
  await repo.updateBook(b.id, { title: "Local title" });
  await repo.applyRemoteEvents(
    [
      {
        entity: "book",
        payload: {
          ...b,
          title: "Old title",
          author: "Remote author",
          version: 2,
        },
      },
    ],
    "1",
  );
  const book = (await repo.exportLibrary()).books[0];
  expect(book.title).toBe("Local title");
  expect(book.author).toBe("Remote author");
});
it("validates an entire backup before importing and makes re-import idempotent", async () => {
  const b = await repo.addBook({ title: "A book" });
  await repo.addHighlight({ bookId: b.id, text: "A passage" });
  const data = await repo.exportLibrary();
  await repo.resetLocalDatabase();
  await repo.importBackup(data);
  await repo.importBackup(data);
  expect((await repo.exportLibrary()).books[0].highlights).toHaveLength(1);
  await expect(
    repo.importBackup({ books: [{ title: "Bad", highlights: [{ text: 3 }] }] }),
  ).rejects.toThrow();
  expect((await repo.exportLibrary()).books).toHaveLength(1);
});
