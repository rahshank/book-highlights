import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { resetLocalDatabase, exportLibrary } from "./local/bookRepository";
beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
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
  await screen.findByRole("heading", { name: "Books" });
  await user.click(screen.getByRole("button", { name: "+ Add Book" }));
  await user.type(screen.getByLabelText("Title"), "Test book");
  await user.type(screen.getByLabelText("Author"), "An author");
  await user.click(screen.getByRole("button", { name: "Save Book" }));
  await screen.findByRole("heading", { name: "Test book" });
  await user.click(screen.getByRole("button", { name: "Add highlight" }));
  await user.type(
    screen.getByLabelText("Highlighted passage"),
    "A memorable passage.",
  );
  await user.type(
    screen.getByLabelText("Your note"),
    "An important connection.",
  );
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
  await user.click(screen.getByRole("link", { name: "Books" }));
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
    screen.queryByRole("heading", { name: "Books" }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "reader@example.test");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await user.type(await screen.findByLabelText("Sign-in code"), "12345678");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Books" }),
    ).toBeInTheDocument(),
  );
});
