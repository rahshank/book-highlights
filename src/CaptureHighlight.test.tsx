import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaptureHighlight } from "./CaptureHighlight";
import { DRAFT_KEY, readCaptureDraft, blankDraft } from "./shared/capture";
import * as repo from "./local/bookRepository";
beforeEach(async () => {
  sessionStorage.clear();
  await repo.resetLocalDatabase();
  history.replaceState(null, "", "#capture");
});
afterEach(cleanup);
it("keeps a partially entered link and passage intact after reload", () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...blankDraft(),
      url: "https://",
      text: "Unfinished passage",
    }),
  );
  expect(readCaptureDraft().text).toBe("Unfinished passage");
  expect(readCaptureDraft().url).toBe("https://");
});
it("resumes an existing-source draft including page, and saves locally without a network", async () => {
  const b = await repo.addBook({ title: "A source" });
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...blankDraft(),
      sourceId: b.id,
      title: b.title,
      text: "Keep this quote",
      note: "Keep this note",
      page: "42",
    }),
  );
  const onSaved = vi.fn();
  render(
    <CaptureHighlight
      books={[b]}
      sourceId={b.id}
      onSaved={onSaved}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByLabelText("Highlight", { exact: true })).toHaveValue(
    "Keep this quote",
  );
  expect(screen.getByLabelText("Page")).toHaveValue(42);
  fireEvent.submit(
    screen.getByRole("button", { name: "Save highlight" }).closest("form")!,
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(b.id));
  const h = (await repo.exportLibrary()).books[0].highlights[0];
  expect(h.pageNumber).toBe(42);
  expect(h.note).toBe("Keep this note");
  expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
});
