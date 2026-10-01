import { beforeEach, expect, it } from "vitest";
import * as repo from "./bookRepository";
import { canonicalSourceUrl, textFromFragment } from "../shared/capture";
beforeEach(() => repo.resetLocalDatabase());
it("creates and reuses an article without dropping meaningful query parameters", async () => {
  const a = await repo.captureHighlight({
    title: "Article",
    url: "https://example.com/read?id=2&utm_source=email#section",
    text: "First passage",
    captureId: "capture-one",
  });
  const b = await repo.captureHighlight({
    title: "Other supplied title",
    url: "https://example.com/read?id=2",
    text: "Second passage",
    captureId: "capture-two",
  });
  expect(b.bookId).toBe(a.bookId);
  expect((await repo.exportLibrary()).books).toHaveLength(1);
  await repo.captureHighlight({
    title: "Different article",
    url: "https://example.com/read?id=3",
    text: "Third passage",
  });
  expect((await repo.exportLibrary()).books).toHaveLength(2);
});
it("retries a capture once, keeps original IDs, and queues source and passage together", async () => {
  const input = {
    title: "A book",
    text: "A passage",
    note: "My note",
    captureId: "same-capture",
  };
  const a = await repo.captureHighlight(input);
  const b = await repo.captureHighlight(input);
  expect(b.id).toBe(a.id);
  expect(await repo.getPendingOutboxOperations()).toHaveLength(2);
  const saved = await repo.exportLibrary();
  await repo.resetLocalDatabase();
  expect(await repo.importBackup(saved)).toBe(1);
  expect(await repo.importBackup(saved)).toBe(0);
  expect((await repo.exportLibrary()).books[0].highlights[0].id).toBe(a.id);
});
it("rolls back the source when its highlight is invalid and rejects unsafe links", async () => {
  await expect(
    repo.captureHighlight({
      title: "Incomplete",
      text: "Passage",
      pageNumber: -1,
    }),
  ).rejects.toThrow();
  expect((await repo.exportLibrary()).books).toHaveLength(0);
  await expect(
    repo.captureHighlight({
      title: "Unsafe",
      url: "javascript:alert(1)",
      text: "Passage",
    }),
  ).rejects.toThrow();
});
it("preserves article metadata through backups and does not fill partial text ranges", async () => {
  await repo.captureHighlight({
    title: "Article",
    url: "https://example.com/a",
    publishedAt: "2026-09-26",
    text: "Exact quote",
    sourceLink: "https://example.com/a#:~:text=Exact%20quote",
  });
  const saved = await repo.exportLibrary();
  await repo.resetLocalDatabase();
  await repo.importBackup(saved);
  const book = (await repo.exportLibrary()).books[0];
  expect(book.url).toBe("https://example.com/a");
  expect(book.highlights[0].sourceLink).toContain("text=Exact");
  expect(textFromFragment("https://example.com/#:~:text=exact%20quote")).toBe(
    "exact quote",
  );
  expect(textFromFragment("https://example.com/#:~:text=start,end")).toBe("");
  expect(canonicalSourceUrl("https://EXAMPLE.com/a?x=1#fragment")).toBe(
    "https://example.com/a?x=1",
  );
});
