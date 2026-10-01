import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanCard, Highlight, BookDetail } from "./App";
import * as repo from "./local/bookRepository";
beforeEach(async () => {
  await repo.resetLocalDatabase();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
it("keeps corrected scan drafts and removed passages across refresh and remount", async () => {
  const user = userEvent.setup(),
    book = await repo.addBook({ title: "Book" });
  const scan = await repo.addScan(
    book.id,
    new Blob(["image"], { type: "image/jpeg" }),
  );
  await repo.updateScan(scan.id, {
    status: "review",
    passages: [
      { text: "Incorrect words", pageNumber: 1 },
      { text: "Unwanted", pageNumber: 1 },
    ],
  });
  const stored = (await repo.listScans())[0],
    onChange = vi.fn();
  const view = render(<ScanCard scan={stored} onChange={onChange} />);
  await user.clear(screen.getByRole("textbox", { name: /Passage 1/ }));
  await user.type(
    screen.getByRole("textbox", { name: /Passage 1/ }),
    "Corrected words",
  );
  await user.click(
    screen.getAllByRole("button", { name: "Remove passage" })[1],
  );
  view.rerender(
    <ScanCard
      scan={{ ...stored, passages: stored.passages.map((p) => ({ ...p })) }}
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("textbox", { name: /Passage 1/ })).toHaveValue(
    "Corrected words",
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  view.unmount();
  render(<ScanCard scan={(await repo.listScans())[0]} onChange={onChange} />);
  expect(screen.getByRole("textbox", { name: /Passage 1/ })).toHaveValue(
    "Corrected words",
  );
});
it("saves only fields edited in a form even when remote props change", async () => {
  const user = userEvent.setup(),
    book = await repo.addBook({ title: "Original", author: "Author" }),
    h = await repo.addHighlight({ bookId: book.id, text: "Original text" }),
    onChange = vi.fn();
  const view = render(<Highlight highlight={h} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.type(screen.getByLabelText("Your note"), "My note");
  await repo.updateHighlight(h.id, { text: "Remote correction" });
  view.rerender(
    <Highlight
      highlight={{ ...h, text: "Remote correction" }}
      onChange={onChange}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save highlight" }));
  expect((await repo.exportLibrary()).books[0].highlights[0]).toMatchObject({
    text: "Remote correction",
    note: "My note",
  });
  view.unmount();
  const initial = {
    ...book,
    url: undefined,
    publishedAt: "2026-09-26T12:00:00Z",
    highlights: [],
  };
  const v = render(
    <BookDetail
      book={initial}
      scans={[]}
      onChange={onChange}
      navigate={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Edit details" }));
  await user.type(screen.getByLabelText("Notes"), "My book note");
  await repo.updateBook(book.id, {
    author: "Remote author",
    url: "https://example.com/new",
    publishedAt: "2026-09-27T12:00:00Z",
  });
  v.rerender(
    <BookDetail
      book={{ ...initial, author: "Remote author" }}
      scans={[]}
      onChange={onChange}
      navigate={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save details" }));
  expect((await repo.exportLibrary()).books[0]).toMatchObject({
    author: "Remote author",
    notes: "My book note",
    url: "https://example.com/new",
    publishedAt: "2026-09-27T12:00:00Z",
  });
});
it("locks local writes before delayed sign-out and never clears pending changes", async () => {
  const book = await repo.addBook({ title: "Book" });
  await expect(repo.beginSignOut()).rejects.toThrow();
  await repo.markOutboxOperationsSynced(
    (await repo.getPendingOutboxOperations()).map((o) => o.id),
    "0",
  );
  await repo.beginSignOut();
  await expect(
    repo.addHighlight({ bookId: book.id, text: "Racing write" }),
  ).rejects.toThrow(/sign/i);
  await expect(
    repo.updateBook(book.id, { notes: "Racing edit" }),
  ).rejects.toThrow(/sign/i);
  await repo.finishSignOut();
  await expect(repo.addBook({ title: "Stale tab" })).rejects.toThrow(/sign/i);
  await repo.unlockLocalDatabase();
  expect((await repo.exportLibrary()).books).toEqual([]);
  await repo.addBook({ title: "New session" });
});
it("rejects unsyncable backups and edits atomically before outbox insertion", async () => {
  await expect(
    repo.importBackup({
      books: [{ id: "bad id", title: "Bad", highlights: [] }],
    }),
  ).rejects.toThrow();
  expect((await repo.exportLibrary()).books).toEqual([]);
  const b = await repo.addBook({ title: "Valid" });
  await expect(
    repo.updateBook(b.id, { notes: "x".repeat(100001) }),
  ).rejects.toThrow();
  expect((await repo.exportLibrary()).books[0].notes).toBe("");
});
it("repairs legacy imported ids without losing content and lets corrected text sync", async () => {
  const { default: Dexie } = await import("dexie");
  const legacy = new Dexie("bookHighlightsLocal");
  await legacy.open();
  const book = await repo.addBook({ title: "Legacy" });
  const [queued] = await repo.getPendingOutboxOperations();
  await legacy.table("books").delete(book.id);
  await legacy
    .table("books")
    .put({ ...book, id: "old bad id", notes: "x".repeat(100001) });
  await legacy.table("outbox").put({
    ...queued,
    entityId: "old bad id",
    payload: { ...book, id: "old bad id", notes: "x".repeat(100001) },
  });
  legacy.close();
  await repo.repairLegacyIdentifiers();
  const repaired = (await repo.exportLibrary()).books[0];
  expect(repaired.id).not.toContain(" ");
  expect(repaired.notes).toHaveLength(100001);
  await repo.updateBook(repaired.id, { notes: "Corrected note" });
  const { syncPendingChanges } = await import("./sync/syncRunner");
  const { validateOperation } = await import("./shared/validation");
  expect(
    (
      await syncPendingChanges({
        push: async (r) => {
          r.operations.forEach(validateOperation);
          return { cursor: "0" };
        },
        pull: async () => ({ events: [], cursor: "0" }),
      })
    ).status,
  ).toBe("synced");
});
it("retains source attribution and source-photo references in its own backup", async () => {
  const b = await repo.addBook({ title: "Scanned book", source: "ocr" });
  await repo.addHighlight({
    bookId: b.id,
    text: "Passage",
    source: "ocr",
    sourceImage: "scan-123",
  });
  const backup = await repo.exportLibrary();
  await repo.resetLocalDatabase();
  await repo.importBackup(backup);
  const restored = (await repo.exportLibrary()).books[0];
  expect(restored.source).toBe("ocr");
  expect(restored.highlights[0]).toMatchObject({
    source: "ocr",
    sourceImage: "scan-123",
  });
});
