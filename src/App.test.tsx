import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { resetLocalDatabase } from "./local/bookRepository";

describe("Book Highlights app shell", () => {
  beforeEach(async () => {
    await resetLocalDatabase();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "#library");
  });

  it("opens the matching surface from the current URL hash", () => {
    window.history.replaceState(null, "", "#import");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Import Highlights" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the library, search, and import surfaces with the current PWA navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "Book Highlights" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add Book" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export JSON" })).toBeInTheDocument();
    expect(screen.getByText("No books yet. Add a book or import Kindle highlights to get started.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Search" }));
    expect(screen.getByRole("heading", { name: "Search Highlights" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search across all your highlights and notes...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Import" }));
    expect(screen.getByRole("heading", { name: "Import Highlights" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kindle Notebook (paste from web)" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste your highlights here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import from Paste" })).toBeInTheDocument();
  });

  it("imports Kindle notebook paste into the local library and search", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "Import" }));
    await user.type(
      screen.getByPlaceholderText(/Paste your highlights here/),
      `The Great Transformation
Karl Polanyi

Yellow highlight | Location: 150
Laissez-faire was planned; planning was not.

Note | Location: 150
Useful line for markets essay.

Yellow highlight | Page: 212
The market economy was a threat to society.`,
    );
    await user.click(screen.getByRole("button", { name: "Import from Paste" }));

    expect(await screen.findByText("Imported 2 highlights.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Library" }));
    await waitFor(() => {
      expect(screen.getByText("The Great Transformation")).toBeInTheDocument();
    });
    expect(screen.getByText("Karl Polanyi")).toBeInTheDocument();
    expect(screen.getByText("2 highlights")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Search" }));
    await user.type(
      screen.getByPlaceholderText("Search across all your highlights and notes..."),
      "markets essay",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Laissez-faire was planned; planning was not.")).toBeInTheDocument();
    expect(screen.getByText("The Great Transformation, Karl Polanyi")).toBeInTheDocument();
  });

  it("adds a manual book to the local library", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "+ Add Book" }));
    await user.type(screen.getByLabelText("Title"), "Notebook of a Return to the Native Land");
    await user.type(screen.getByLabelText("Author"), "Aime Cesaire");
    await user.click(screen.getByRole("button", { name: "Save Book" }));

    expect(await screen.findByText("Notebook of a Return to the Native Land")).toBeInTheDocument();
    expect(screen.getByText("Aime Cesaire")).toBeInTheDocument();
    expect(screen.getByText("0 highlights")).toBeInTheDocument();
    expect(screen.getByText("1 change pending")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(screen.getByText("Sync needs backend setup.")).toBeInTheDocument();
  });
});
