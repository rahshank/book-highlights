import { type FormEvent, useEffect, useState } from "react";
import {
  addBook,
  exportLibrary,
  getSyncStatus,
  importNotebookPaste,
  searchHighlights,
  type HighlightSearchResult,
  type LocalBook,
  type LocalHighlight,
  type SyncStatus,
} from "./local/bookRepository";
import { createConfiguredSyncTransport } from "./sync/configuredSyncTransport";
import { syncPendingChanges } from "./sync/syncRunner";
import "./styles.css";

type View = "library" | "search" | "import";
type ExportedBook = LocalBook & { highlights: LocalHighlight[] };

export default function App() {
  const [view, setView] = useState<View>(getInitialView);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getSyncStatus()
      .then((nextStatus) => {
        if (!cancelled) setSyncStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setSyncStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(nextView: View) {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
  }

  async function refreshSyncStatus() {
    try {
      setSyncStatus(await getSyncStatus());
    } catch {
      setSyncStatus(null);
    }
  }

  async function refreshLocalState() {
    setLibraryRefresh((value) => value + 1);
    await refreshSyncStatus();
  }

  async function handleSyncNow() {
    setSyncMessage("");
    const transport = createConfiguredSyncTransport();

    if (!transport) {
      setSyncMessage("Sync needs backend setup.");
      return;
    }

    setIsSyncing(true);
    const result = await syncPendingChanges(transport);
    await refreshSyncStatus();
    setIsSyncing(false);

    if (result.status === "idle") {
      setSyncMessage("No changes to sync.");
    } else if (result.status === "synced") {
      setSyncMessage(`Synced ${result.pushed} ${result.pushed === 1 ? "change" : "changes"}.`);
    } else {
      setSyncMessage(result.error);
    }
  }

  return (
    <>
      <nav className="app-nav" aria-label="Primary navigation">
        <div className="nav-inner">
          <a
            className="logo"
            href="#library"
            aria-label="Book Highlights"
            onClick={() => navigate("library")}
          >
            <span>Book</span>
            <span>Highlights</span>
          </a>
          <div className="nav-links">
            <a
              href="#library"
              aria-current={view === "library" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              Library
            </a>
            <a
              href="#search"
              aria-current={view === "search" ? "page" : undefined}
              onClick={() => navigate("search")}
            >
              Search
            </a>
            <a
              href="#import"
              aria-current={view === "import" ? "page" : undefined}
              onClick={() => navigate("import")}
            >
              Import
            </a>
          </div>
          <SyncBadge status={syncStatus} isSyncing={isSyncing} onSyncNow={handleSyncNow} />
        </div>
      </nav>
      {syncMessage && <div className="sync-message">{syncMessage}</div>}

      <main className="container">
        {view === "library" && (
          <LibraryView refreshToken={libraryRefresh} onLocalChange={refreshSyncStatus} />
        )}
        {view === "search" && <SearchView />}
        {view === "import" && <ImportView onImported={refreshLocalState} />}
      </main>
    </>
  );
}

function SyncBadge({
  status,
  isSyncing,
  onSyncNow,
}: {
  status: SyncStatus | null;
  isSyncing: boolean;
  onSyncNow: () => void;
}) {
  const pendingCount = status?.pendingCount ?? 0;
  const label =
    pendingCount === 0
      ? "Synced locally"
      : `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} pending`;

  return (
    <div className="sync-control" aria-live="polite">
      <span className="sync-badge">{label}</span>
      <button className="sync-button" type="button" onClick={onSyncNow} disabled={isSyncing}>
        {isSyncing ? "Syncing" : "Sync now"}
      </button>
    </div>
  );
}

function getInitialView(): View {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "search" || hash === "import") return hash;
  return "library";
}

function LibraryView({
  refreshToken,
  onLocalChange,
}: {
  refreshToken: number;
  onLocalChange: () => Promise<void>;
}) {
  const [books, setBooks] = useState<ExportedBook[]>([]);
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualMessage, setManualMessage] = useState("");

  async function loadLibrary() {
    const library = await exportLibrary();
    setBooks(library.books);
  }

  useEffect(() => {
    let cancelled = false;

    exportLibrary().then((library) => {
      if (!cancelled) setBooks(library.books);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function handleAddBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualMessage("");

    try {
      await addBook({ title: manualTitle, author: manualAuthor, source: "manual" });
      setManualTitle("");
      setManualAuthor("");
      setIsAddingBook(false);
      await loadLibrary();
      await onLocalChange();
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : "Book could not be saved.");
    }
  }

  return (
    <section aria-labelledby="library-heading">
      <div className="library-header">
        <h1 id="library-heading">Your Library</h1>
        <div className="library-actions">
          <a href="#export" className="btn btn-secondary">
            Export JSON
          </a>
          <button className="btn btn-primary" onClick={() => setIsAddingBook(true)}>
            + Add Book
          </button>
        </div>
      </div>

      {isAddingBook && (
        <form className="manual-book-form" onSubmit={handleAddBook}>
          <label>
            <span>Title</span>
            <input
              required
              type="text"
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
            />
          </label>
          <label>
            <span>Author</span>
            <input
              type="text"
              value={manualAuthor}
              onChange={(event) => setManualAuthor(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Save Book
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setIsAddingBook(false);
                setManualMessage("");
              }}
            >
              Cancel
            </button>
          </div>
          {manualMessage && <p className="status-message">{manualMessage}</p>}
        </form>
      )}

      {books.length === 0 ? (
        <div className="empty">
          <p>No books yet. Add a book or import Kindle highlights to get started.</p>
        </div>
      ) : (
        <div className="book-list" aria-label="Library books">
          {books.map((book) => (
            <article className="book-card" key={book.id}>
              <h2>{book.title}</h2>
              {book.author && <p className="book-meta">{book.author}</p>}
              <p className="book-count">
                {book.highlights.length} {book.highlights.length === 1 ? "highlight" : "highlights"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HighlightSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults(await searchHighlights(query));
    setHasSearched(true);
  }

  return (
    <section aria-labelledby="search-heading">
      <h1 id="search-heading">Search Highlights</h1>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Search across all your highlights and notes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {hasSearched && (
        <div className="search-results" aria-live="polite">
          {results.length === 0 ? (
            <p className="empty-inline">No matching highlights.</p>
          ) : (
            results.map((result) => (
              <article className="highlight-card" key={result.highlightId}>
                <p>{result.text}</p>
                <p className="book-meta">
                  {result.bookTitle}
                  {result.bookAuthor ? `, ${result.bookAuthor}` : ""}
                </p>
                {result.note && <p className="highlight-note">{result.note}</p>}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function ImportView({ onImported }: { onImported: () => Promise<void> }) {
  const [paste, setPaste] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [authorOverride, setAuthorOverride] = useState("");
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsImporting(true);
    setMessage("");

    try {
      const result = await importNotebookPaste({ paste, titleOverride, authorOverride });
      setMessage(
        result.imported > 0
          ? `Imported ${result.imported} ${result.imported === 1 ? "highlight" : "highlights"}.`
          : `No new highlights. Skipped ${result.skipped} duplicate ${result.skipped === 1 ? "highlight" : "highlights"}.`,
      );
      setPaste("");
      await onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section aria-labelledby="import-heading">
      <h1 id="import-heading">Import Highlights</h1>

      <h2>Kindle Notebook (paste from web)</h2>
      <p className="help-copy">
        Go to{" "}
        <a href="https://read.amazon.com/notebook" target="_blank" rel="noreferrer">
          read.amazon.com/notebook
        </a>
        , select a book, then select all highlights (Ctrl+A / Cmd+A) and copy-paste them below.
        Safe to repeat — duplicates are skipped automatically.
      </p>

      <form className="import-form" onSubmit={handleSubmit}>
        <textarea
          rows={10}
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder={
            "Paste your highlights here...\n\nExample format:\nYellow highlight | Location: 150\nThe actual highlighted text..."
          }
        />
        <div className="import-fields">
          <input
            type="text"
            placeholder="Book title (auto-detected)"
            value={titleOverride}
            onChange={(event) => setTitleOverride(event.target.value)}
          />
          <input
            type="text"
            placeholder="Author (auto-detected)"
            value={authorOverride}
            onChange={(event) => setAuthorOverride(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isImporting}>
          {isImporting ? "Importing..." : "Import from Paste"}
        </button>
        {message && <p className="status-message">{message}</p>}
      </form>
    </section>
  );
}
