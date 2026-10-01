import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./authClient", () => ({ authClient: {
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({ data: { success: true } })) },
  signIn: { emailOtp: vi.fn(async () => ({ data: {} })) },
} }));
import App from "./App";
import { resetLocalDatabase, exportLibrary } from "./local/bookRepository";
beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path.includes("/auth/session")
              ? { signedIn: true }
              : path.includes("/sync/pull")
                ? { cursor: "0", events: [] }
                : { cursor: "0" },
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "#library");
});
it("creates a book, opens it, edits highlights and finds notes in search", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Library" });
  await user.click(screen.getByRole("button", { name: "+ Add highlight" }));
  await user.type(
    screen.getByLabelText("Highlight", { exact: true }),
    "A memorable passage.",
  );
  await user.type(
    screen.getByLabelText("Source", { exact: true }),
    "Test book",
  );
  await user.type(screen.getByLabelText(/Author/), "An author");
  await user.type(screen.getByLabelText(/Note/), "An important connection.");
  await user.click(screen.getByRole("button", { name: "Save highlight" }));
  await screen.findByText("A memorable passage.");
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Your note"));
  await user.type(screen.getByLabelText("Your note"), "A revised connection.");
  await user.click(screen.getByRole("button", { name: "Save highlight" }));
  await user.click(screen.getByRole("link", { name: "Search" }));
  await user.type(
    screen.getByLabelText("Search highlights and notes"),
    "revised",
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("A memorable passage.")).toBeInTheDocument();
  expect((await exportLibrary()).books[0].highlights[0].note).toBe(
    "A revised connection.",
  );
});
it("imports notebook text and makes the imported book readable", async () => {
  window.history.replaceState(null, "", "#import");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Import highlights" });
  await user.type(
    screen.getByLabelText("Notebook text"),
    "The Great Transformation\nKarl Polanyi\n\nYellow highlight | Location: 150\nLaissez-faire was planned; planning was not.",
  );
  await user.click(screen.getByRole("button", { name: "Import highlights" }));
  await screen.findByText("Imported 1 highlights. Skipped 0 duplicates.");
  await user.click(screen.getByRole("link", { name: "Library" }));
  await user.click(
    await screen.findByRole("link", { name: "The Great Transformation" }),
  );
  expect(
    await screen.findByText("Laissez-faire was planned; planning was not."),
  ).toBeInTheDocument();
});
it("requires sign-in on a fresh browser and accepts only a verified code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path.includes("/auth/session")
              ? { signedIn: false }
              : path.includes("/auth/request")
                ? { challengeId: "test" }
                : path.includes("/sync/pull")
                  ? { cursor: "0", events: [] }
                  : { ok: true },
          ),
        ),
    ),
  );
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Email me a code" });
  expect(
    screen.queryByRole("heading", { name: "Library" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await user.type(screen.getByLabelText("Email"), "reader@example.test");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await user.type(await screen.findByLabelText("Sign-in code"), "12345678");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Library" }),
    ).toBeInTheDocument(),
  );
});
it("keeps an incoming capture through sign-in and clears a private draft on cross-tab sign-out", async () => {
  const { blankDraft, DRAFT_KEY } = await import("./shared/capture");
  history.replaceState(
    null,
    "",
    "#capture=" +
      encodeURIComponent(
        JSON.stringify({
          ...blankDraft(),
          title: "Article",
          url: "https://example.com/a",
          text: "Transferred passage",
        }),
      ),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path.includes("/auth/session")
              ? { signedIn: false }
              : path.includes("/auth/request")
                ? { challengeId: "test" }
                : path.includes("/sync/pull")
                  ? { cursor: "0", events: [] }
                  : { ok: true },
          ),
        ),
    ),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Email me a code" }));
  await user.type(await screen.findByLabelText("Email"), "reader@example.test");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await user.type(await screen.findByLabelText("Sign-in code"), "12345678");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(
    await screen.findByLabelText("Highlight", { exact: true }),
  ).toHaveValue("Transferred passage");
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "book-highlights-unlocked",
      newValue: "no",
    }),
  );
  await screen.findByRole("button", { name: "Email me a code" });
  expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
});
it("focuses the new source form when opened from the bottom of the library", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", {
      name: "Add a title without a highlight",
    }),
  );
  expect(screen.getByLabelText("Title", { exact: true })).toHaveFocus();
});
