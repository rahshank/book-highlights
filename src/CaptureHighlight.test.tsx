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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
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

it("fills article details without replacing a title typed while lookup is pending", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  render(
    <CaptureHighlight
      books={[]}
      onSaved={async () => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Source", { exact: true }), {
    target: { value: "https://arenamag.com/articles/forward-deployed" },
  });
  await waitFor(() => expect(resolve).toBeDefined());
  fireEvent.change(screen.getByLabelText(/Article title/), {
    target: { value: "My title" },
  });
  resolve(
    new Response(
      JSON.stringify({
        title: "Forward Deployed",
        author: "Nikhil Davar & Byrne Hobart",
        publisher: "Arena Magazine",
        publishedAt: "2026-09-18",
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Author/)).toHaveValue(
      "Nikhil Davar & Byrne Hobart",
    ),
  );
  expect(screen.getByLabelText(/Article title/)).toHaveValue("My title");
  vi.unstubAllGlobals();
});
it("saves an article by its link when details cannot be fetched", async () => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 502 }));
  const onSaved = vi.fn();
  render(<CaptureHighlight books={[]} onSaved={onSaved} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText("Highlight", { exact: true }), {
    target: { value: "Keep this article passage" },
  });
  fireEvent.change(screen.getByLabelText("Source", { exact: true }), {
    target: { value: "https://example.com/story" },
  });
  await screen.findByText(/couldn’t.*details/i);
  fireEvent.click(screen.getByRole("button", { name: "Save highlight" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const b = (await repo.exportLibrary()).books[0];
  expect(b.url).toBe("https://example.com/story");
  expect(b.title).toBe("https://example.com/story");
  expect(b.highlights[0].text).toBe("Keep this article passage");
  vi.unstubAllGlobals();
});
it("reuses an existing article immediately when its link includes tracking or a text fragment", async () => {
  const b = await repo.addBook({
    title: "Existing article",
    author: "Original author",
    url: "https://example.com/story",
  });
  render(
    <CaptureHighlight
      books={[b]}
      onSaved={async () => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Source", { exact: true }), {
    target: {
      value: "https://example.com/story?utm_source=mail#:~:text=words",
    },
  });
  expect(
    await screen.findByText("Adding to an existing source."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/Article title/)).not.toBeInTheDocument();
});
it("ignores an old lookup after the user changes the source", async () => {
  const pending = new Map<string, (r: Response) => void>();
  vi.stubGlobal(
    "fetch",
    (_path: string, init: RequestInit) =>
      new Promise<Response>((resolve) =>
        pending.set(JSON.parse(String(init.body)).url, resolve),
      ),
  );
  render(
    <CaptureHighlight
      books={[]}
      onSaved={async () => {}}
      onCancel={() => {}}
    />,
  );
  const source = screen.getByLabelText("Source", { exact: true });
  fireEvent.change(source, { target: { value: "https://example.com/old" } });
  await waitFor(() =>
    expect(pending.has("https://example.com/old")).toBe(true),
  );
  fireEvent.change(source, { target: { value: "https://example.com/new" } });
  await waitFor(() =>
    expect(pending.has("https://example.com/new")).toBe(true),
  );
  pending.get("https://example.com/new")!(
    Response.json({ title: "New article", author: "New author" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Article title/)).toHaveValue("New article"),
  );
  pending.get("https://example.com/old")!(
    Response.json({ title: "Wrong article", author: "Wrong author" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.getByLabelText(/Article title/)).toHaveValue("New article");
  expect(screen.getByLabelText(/Author/)).toHaveValue("New author");
  vi.unstubAllGlobals();
});
it("keeps a pasted passage link and quoted text when selecting an existing article", async () => {
  const b = await repo.addBook({
    title: "Existing",
    url: "https://example.com/story",
  });
  const saved = vi.fn();
  render(<CaptureHighlight books={[b]} onSaved={saved} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText("Source", { exact: true }), {
    target: { value: "https://example.com/story#:~:text=Keep%20these%20words" },
  });
  expect(screen.getByLabelText("Highlight", { exact: true })).toHaveValue(
    "Keep these words",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save highlight" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect((await repo.exportLibrary()).books[0].highlights[0].sourceLink).toBe(
    "https://example.com/story#:~:text=Keep%20these%20words",
  );
});
it("keeps loaded metadata when only the fragment or tracking parameters change", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ title: "Real title", author: "Real author" }),
  );
  render(
    <CaptureHighlight
      books={[]}
      onSaved={async () => {}}
      onCancel={() => {}}
    />,
  );
  const source = screen.getByLabelText("Source", { exact: true });
  fireEvent.change(source, { target: { value: "https://example.com/story" } });
  await waitFor(() =>
    expect(screen.getByLabelText(/Article title/)).toHaveValue("Real title"),
  );
  fireEvent.change(source, {
    target: {
      value: "https://example.com/story?utm_source=email#:~:text=words",
    },
  });
  expect(screen.getByLabelText(/Article title/)).toHaveValue("Real title");
  expect(screen.getByLabelText(/Author/)).toHaveValue("Real author");
});
