import { CaptureHighlight } from "./CaptureHighlight";
import { DRAFT_KEY, readCaptureDraft } from "./shared/capture";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import * as repo from "./local/bookRepository";
import { syncPendingChanges } from "./sync/syncRunner";
import { createConfiguredSyncTransport } from "./sync/configuredSyncTransport";
import "./styles.css";
import { ThemeToggle } from "./ThemeToggle";
type Book = repo.LocalBook & { highlights: repo.LocalHighlight[] };
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
function remember(value: boolean) {
  try {
    localStorage.setItem("book-highlights-unlocked", value ? "yes" : "no");
  } catch {
    /* Online use still works. */
  }
}
function remembered() {
  try {
    return localStorage.getItem("book-highlights-unlocked") === "yes";
  } catch {
    return false;
  }
}
function exportDownload() {
  void repo.exportLibrary().then((library) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(library, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `book-highlights-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
export default function App() {
  useEffect(() => {
    if (location.hash.startsWith("#capture=")) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(readCaptureDraft()));
        history.replaceState(null, "", "#capture");
        setRoute("capture");
      } catch {
        /* The URL still holds the draft if storage is unavailable. */
      }
    }
  }, []);
  const [access, setAccess] = useState<"checking" | "yes" | "no" | "leaving">(
      "checking",
    ),
    [route, setRoute] = useState(location.hash.slice(1) || "library");
  const [books, setBooks] = useState<Book[]>([]),
    [scans, setScans] = useState<repo.LocalScan[]>([]),
    [pending, setPending] = useState(0),
    [syncError, setSyncError] = useState(""),
    [syncing, setSyncing] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("");
  const active = useRef(false),
    syncBusy = useRef(false),
    scanBusy = useRef(false),
    retryAfter = useRef(0),
    failures = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const [library, status, photos] = await Promise.all([
        repo.exportLibrary(),
        repo.getSyncStatus(),
        repo.listScans(),
      ]);
      if (active.current) {
        setBooks(library.books);
        setPending(status.pendingCount);
        setScans(photos);
      }
    } catch (error) {
      if (active.current) setSyncError(errorText(error));
    }
  }, []);
  const processScans = useCallback(async () => {
    if (scanBusy.current || !active.current || !navigator.onLine) return;
    scanBusy.current = true;
    try {
      for (const photo of (await repo.listScans()).filter(
        (p) => p.status === "pending",
      )) {
        if (!active.current) break;
        try {
          const response = await fetch("/api/ocr", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": photo.image.type,
              "X-Scan-Id": photo.id,
              "X-Book-Id": photo.bookId,
            },
            body: photo.image,
            signal: AbortSignal.timeout(75000),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Photo extraction failed.");
          if (active.current)
            await repo.updateScan(photo.id, {
              status: "review",
              passages: result.passages,
              warning: result.warning,
              error: "",
            });
        } catch (e) {
          if (active.current)
            await repo.updateScan(photo.id, {
              status: "failed",
              error: errorText(e),
            });
        }
        await refresh();
      }
    } catch (error) {
      if (active.current) setMessage(errorText(error));
    } finally {
      scanBusy.current = false;
    }
  }, [refresh]);
  const sync = useCallback(
    async (manual = false) => {
      if (syncBusy.current || !active.current) return;
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }
      if (!manual && Date.now() < retryAfter.current) return;
      syncBusy.current = true;
      setSyncing(true);
      try {
        const result = await syncPendingChanges(
          createConfiguredSyncTransport(),
          () => active.current && remembered(),
        );
        if (!active.current) return;
        if (result.status === "failed") {
          failures.current++;
          retryAfter.current =
            Date.now() + Math.min(300000, 15000 * 2 ** failures.current);
          setSyncError(result.error);
        } else {
          failures.current = 0;
          retryAfter.current = 0;
          setSyncError("");
          setOnline(true);
        }
        await refresh();
        void processScans();
      } catch (error) {
        if (active.current) {
          setSyncError(errorText(error));
          retryAfter.current = Date.now() + 15000;
        }
      } finally {
        syncBusy.current = false;
        if (active.current) setSyncing(false);
      }
    },
    [refresh, processScans],
  );
  const changed = useCallback(async () => {
    await refresh();
    void sync(true);
  }, [refresh, sync]);
  useEffect(() => {
    let stopped = false;
    api("/api/auth/session")
      .then(async (r) => {
        const allowed = r.signedIn && !(await repo.isLocalLocked());
        if (!stopped) {
          remember(allowed);
          setAccess(allowed ? "yes" : "no");
        }
      })
      .catch(() => {
        if (!stopped) {
          setOnline(false);
          setAccess(remembered() ? "yes" : "no");
        }
      });
    const hash = () => {
      setRoute(location.hash.slice(1) || "library");
      setMessage("");
    };
    window.addEventListener("hashchange", hash);
    const storage = (e: StorageEvent) => {
      if (e.key === "book-highlights-unlocked" && e.newValue !== "yes") {
        active.current = false;
        sessionStorage.removeItem(DRAFT_KEY);
        setAccess("no");
        setBooks([]);
      }
    };
    window.addEventListener("storage", storage);
    return () => {
      stopped = true;
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    active.current = access === "yes";
    if (access !== "yes") return;
    void refresh();
    void sync(true);
    const connected = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync(true);
    };
    const focus = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    document.addEventListener("visibilitychange", focus);
    const interval = setInterval(() => void sync(), 15000);
    return () => {
      active.current = false;
      clearInterval(interval);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [access, refresh, sync]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  async function logout() {
    if (syncBusy.current || scanBusy.current) {
      setMessage(
        "Wait for the current save or photo to finish, then sign out.",
      );
      return;
    }
    try {
      await repo.beginSignOut();
    } catch (e) {
      setMessage(errorText(e));
      return;
    }
    active.current = false;
    remember(false);
    sessionStorage.removeItem(DRAFT_KEY);
    setAccess("leaving");
    try {
      await api("/api/auth/logout", {});
      await repo.finishSignOut();
      setAccess("no");
      setBooks([]);
    } catch {
      await repo.unlockLocalDatabase();
      remember(true);
      setAccess("yes");
      setMessage("Reconnect to sign out and remove this device’s copy.");
    }
  }

  const navigate = (next: string) => {
    location.hash = next;
    setRoute(next);
    setMessage("");
    window.scrollTo(0, 0);
  };
  const book = route.startsWith("book/")
    ? books.find((b) => b.id === route.slice(5))
    : undefined;
  return (
    <>
      <nav className="app-nav" aria-label="Primary navigation">
        <div className="nav-inner">
          <div className="brand">
            <a
              className="logo"
              href="#library"
              aria-label="Book Highlights"
              onClick={() => navigate("library")}
            >
              highlights
            </a>
            <ThemeToggle />
          </div>
          {access === "yes" && (
            <>
              <div className="nav-links">
                {["library", "search", "import"].map((v) => (
                  <a
                    key={v}
                    href={"#" + v}
                    aria-current={route === v ? "page" : undefined}
                    onClick={() => navigate(v)}
                  >
                    {v === "library"
                      ? "Library"
                      : v[0].toUpperCase() + v.slice(1)}
                  </a>
                ))}
              </div>
              <button className="text-button" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </nav>
      <main className="container">
        {access === "checking" || access === "leaving" ? (
          <p role="status">
            {access === "leaving" ? "Signing out…" : "Opening your library…"}
          </p>
        ) : access === "no" ? (
          <Login
            onSignedIn={async () => {
              await repo.unlockLocalDatabase();
              remember(true);
              setAccess("yes");
            }}
          />
        ) : (
          <>
            {(!online || pending > 0 || syncError) && (
              <div className="sync-notice" role="status">
                <span>
                  {!online
                    ? "Offline — changes stay on this device."
                    : syncError ||
                      `${pending} ${pending === 1 ? "change" : "changes"} waiting to sync.`}
                </span>
                {online && (
                  <button
                    className="text-button"
                    disabled={syncing}
                    onClick={() => void sync(true)}
                  >
                    {syncing ? "Syncing…" : "Retry sync"}
                  </button>
                )}
                {syncError.includes("Sign in") && (
                  <button
                    className="text-button"
                    onClick={() => setAccess("no")}
                  >
                    Sign in again
                  </button>
                )}
              </div>
            )}
            {route === "library" && (
              <Library books={books} onChange={changed} navigate={navigate} />
            )}
            {route.startsWith("capture") &&
              (!route.startsWith("capture/") ||
                books.some((b) => b.id === route.slice(8))) && (
                <CaptureHighlight
                  key={route}
                  books={books}
                  sourceId={
                    route.startsWith("capture/") ? route.slice(8) : undefined
                  }
                  onSaved={async (id) => {
                    await changed();
                    navigate("book/" + id);
                    setMessage("Highlight saved.");
                  }}
                  onCancel={() => navigate("library")}
                />
              )}
            {route.startsWith("capture/") &&
              !books.some((b) => b.id === route.slice(8)) && (
                <p>
                  Opening the source… <a href="#library">Back to library</a>
                </p>
              )}
            {route === "search" && <Search books={books} navigate={navigate} />}
            {route === "import" && <Import onChange={changed} />}
            {route.startsWith("book/") &&
              (book ? (
                <BookDetail
                  key={book.id}
                  book={book}
                  scans={scans.filter((p) => p.bookId === book.id)}
                  onChange={changed}
                  navigate={navigate}
                />
              ) : (
                <>
                  <h1>Source unavailable</h1>
                  <p>
                    This source may have been removed or may still be syncing.
                  </p>
                  <a href="#library">Back to library</a>
                </>
              ))}
          </>
        )}
      </main>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
function Login({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await api("/api/auth/verify", {
          challengeId: challenge,
          code: code.replace(/\s/g, ""),
        });
        await onSignedIn();
      } else {
        const result = await api("/api/auth/request", { email });
        setChallenge(result.challengeId);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-panel">
      <h1>Sign in</h1>
      <p>Access your saved highlights and notes.</p>
      <form onSubmit={submit} className="stack">
        {!challenge ? (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        ) : (
          <>
            <p>
              Check your email for an eight-digit code. It expires in 10
              minutes. If needed, check Spam.
            </p>
            <label>
              Sign-in code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{8,12}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : challenge ? "Sign in" : "Email me a code"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      {challenge && (
        <button
          className="text-button"
          onClick={() => {
            setChallenge("");
            setCode("");
            setError("");
          }}
        >
          Use another email or request a new code
        </button>
      )}
    </section>
  );
}
function Library({
  books,
  onChange,
  navigate,
}: {
  books: Book[];
  onChange: () => Promise<void>;
  navigate: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [adding, setAdding] = useState(false);
  return (
    <section>
      <div className="library-header">
        <h1>Library</h1>
        <div className="library-actions">
          <button className="btn" onClick={exportDownload}>
            Export JSON
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate("capture")}
          >
            + Add highlight
          </button>
        </div>
      </div>
      {adding && (
        <BookForm
          onSave={async (p) => {
            const b = await repo.addBook(p);
            await onChange();
            setAdding(false);
            navigate("book/" + b.id);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {books.length > 0 && (
        <label className="library-filter">
          <span className="sr-only">Filter library</span>
          <input
            type="search"
            placeholder="Find a title or author"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {books.length === 0 ? (
        <p className="empty">
          No highlights yet. Add a passage or import from Kindle.
        </p>
      ) : (
        <div className="book-list">
          {books
            .filter((b) =>
              (b.title + " " + b.author)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((b) => (
              <article className="book-card" key={b.id}>
                <h2>
                  <a
                    href={"#book/" + b.id}
                    onClick={() => navigate("book/" + b.id)}
                  >
                    {b.title}
                  </a>
                </h2>
                <p className="book-meta">{b.author}</p>
                <p className="book-count">
                  {b.highlights.length}{" "}
                  {b.highlights.length === 1 ? "highlight" : "highlights"}
                </p>
              </article>
            ))}
        </div>
      )}
      <p className="library-secondary">
        <button className="text-button" onClick={() => setAdding(true)}>
          Add a title without a highlight
        </button>
        <span className="book-meta"> — for notes or photographing a page.</span>
      </p>
    </section>
  );
}
function BookForm({
  book,
  onSave,
  onCancel,
}: {
  book?: Book;
  onSave: (
    p: {
      title: string;
      author: string;
      notes: string;
      isbn: string;
      url: string;
      publisher: string;
      publishedAt: string;
    },
    fields: string[],
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const baseline = useRef(book);
  const [title, setTitle] = useState(book?.title ?? ""),
    [author, setAuthor] = useState(book?.author ?? ""),
    [notes, setNotes] = useState(book?.notes ?? ""),
    [isbn, setIsbn] = useState(book?.isbn ?? ""),
    [url, setUrl] = useState(book?.url ?? ""),
    [publisher, setPublisher] = useState(book?.publisher ?? ""),
    [publishedAt, setPublishedAt] = useState(
      book?.publishedAt?.slice(0, 10) ?? "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function lookup() {
    setBusy(true);
    setError("");
    try {
      const found = await api("/api/isbn/" + encodeURIComponent(isbn));
      setTitle(found.title);
      setAuthor(found.author);
      setIsbn(found.isbn);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="stack panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const values = {
            title,
            author,
            notes,
            isbn,
            url,
            publisher,
            publishedAt,
          };
          await onSave(
            values,
            Object.keys(values).filter(
              (k) =>
                !baseline.current ||
                values[k as keyof typeof values] !==
                  (k === "publishedAt"
                    ? (baseline.current.publishedAt?.slice(0, 10) ?? "")
                    : (baseline.current[k as keyof Book] ?? "")),
            ),
          );
        } catch (e) {
          setError(errorText(e));
          setBusy(false);
        }
      }}
    >
      <label>
        Title
        <input
          required
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Author
        <input
          maxLength={500}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </label>
      {!url && (
        <>
          <label>
            ISBN, if you have it
            <input
              maxLength={20}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </label>
          <button
            className="text-button"
            type="button"
            disabled={busy || !isbn.trim()}
            onClick={() => void lookup()}
          >
            Look up title and author
          </button>
        </>
      )}
      <label>
        Article link (optional)
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      {url && (
        <>
          <label>
            Publisher
            <input
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </label>
          <label>
            Published
            <input
              type="date"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Notes
        <textarea
          rows={3}
          maxLength={100000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : "Save details"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function BookDetail({
  book,
  scans,
  onChange,
  navigate,
}: {
  book: Book;
  scans: repo.LocalScan[];
  onChange: () => Promise<void>;
  navigate: (s: string) => void;
}) {
  const [edit, setEdit] = useState(false),
    [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  return (
    <section>
      <a className="back-link" href="#library">
        ← Library
      </a>
      <h1 className="book-title">{book.title}</h1>
      <p className="book-author">{book.author}</p>
      {book.url && (
        <p className="book-meta">
          <a href={book.url} target="_blank" rel="noopener noreferrer">
            {book.publisher || new URL(book.url).hostname} ↗
          </a>
          {book.publishedAt && ` · Published ${book.publishedAt.slice(0, 10)}`}
        </p>
      )}
      {edit ? (
        <BookForm
          book={book}
          onSave={async (p, fields) => {
            const patch = Object.fromEntries(
              Object.entries(p).filter(([k]) => fields.includes(k)),
            );
            await repo.updateBook(book.id, patch);
            setEdit(false);
            await onChange();
          }}
          onCancel={() => setEdit(false)}
        />
      ) : (
        <>
          <p className="book-notes">{book.notes}</p>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={() => navigate("capture/" + book.id)}
            >
              Add highlight
            </button>
            <label className="btn file-button">
              Photograph a page
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setError("");
                  try {
                    await repo.addScan(book.id, f);
                    await onChange();
                  } catch (e) {
                    setError(errorText(e));
                  }
                  e.target.value = "";
                }}
              />
            </label>
            <button className="text-button" onClick={() => setEdit(true)}>
              Edit details
            </button>
            <button
              className="text-button danger"
              onClick={() => setRemoving(true)}
            >
              Delete source
            </button>
          </div>
        </>
      )}
      {removing && (
        <div className="panel" role="alert">
          <p>
            Delete this source and its {book.highlights.length} highlights from
            your library and synced devices?
          </p>
          <button
            className="btn danger"
            onClick={async () => {
              await repo.deleteBook(book.id);
              await onChange();
              navigate("library");
            }}
          >
            Delete source and highlights
          </button>{" "}
          <button className="btn" onClick={() => setRemoving(false)}>
            Keep source
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {adding && (
        <HighlightForm
          onSave={async (p) => {
            await repo.addHighlight({ bookId: book.id, ...p });
            setAdding(false);
            await onChange();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {scans.map((scan) => (
        <ScanCard key={scan.id} scan={scan} onChange={onChange} />
      ))}
      <div className="highlight-list">
        {book.highlights.length === 0 && !adding ? (
          <p className="empty-inline">
            No highlights yet. Write one, import from Kindle, or photograph a
            marked page.
          </p>
        ) : (
          book.highlights.map((h) => (
            <Highlight key={h.id} highlight={h} onChange={onChange} />
          ))
        )}
      </div>
    </section>
  );
}
function HighlightForm({
  highlight,
  onSave,
  onCancel,
}: {
  highlight?: repo.LocalHighlight;
  onSave: (
    p: {
      text: string;
      note: string;
      pageNumber: number | null;
      chapter: string;
    },
    fields: string[],
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const baseline = useRef(highlight);
  const [text, setText] = useState(highlight?.text ?? ""),
    [note, setNote] = useState(highlight?.note ?? ""),
    [page, setPage] = useState(highlight?.pageNumber?.toString() ?? ""),
    [chapter, setChapter] = useState(highlight?.chapter ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="stack panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const values = {
            text,
            note,
            pageNumber: page ? Number(page) : null,
            chapter,
          };
          await onSave(
            values,
            Object.keys(values).filter(
              (k) =>
                !baseline.current ||
                values[k as keyof typeof values] !==
                  baseline.current[k as keyof repo.LocalHighlight],
            ),
          );
        } catch (e) {
          setError(errorText(e));
          setBusy(false);
        }
      }}
    >
      <label>
        Highlighted passage
        <textarea
          required
          rows={5}
          maxLength={50000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Your note
        <textarea
          rows={3}
          maxLength={50000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="import-fields">
        <label>
          Page
          <input
            type="number"
            min="1"
            step="1"
            value={page}
            onChange={(e) => setPage(e.target.value)}
          />
        </label>
        <label>
          Chapter
          <input value={chapter} onChange={(e) => setChapter(e.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save highlight"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function Highlight({
  highlight: h,
  onChange,
}: {
  highlight: repo.LocalHighlight;
  onChange: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  if (edit)
    return (
      <HighlightForm
        highlight={h}
        onSave={async (p, fields) => {
          const patch = Object.fromEntries(
            Object.entries(p).filter(([k]) => fields.includes(k)),
          );
          await repo.updateHighlight(h.id, patch);
          setEdit(false);
          await onChange();
        }}
        onCancel={() => setEdit(false)}
      />
    );
  return (
    <article className="highlight-card">
      <blockquote>{h.text}</blockquote>
      {h.sourceLink && (
        <a href={h.sourceLink} target="_blank" rel="noopener noreferrer">
          Open passage ↗
        </a>
      )}
      {h.note && <p className="highlight-note">{h.note}</p>}
      <p className="book-meta">
        {[
          h.pageNumber ? "Page " + h.pageNumber : "",
          h.location ? "Location " + h.location : "",
          h.chapter,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="item-actions">
        <button className="text-button" onClick={() => setEdit(true)}>
          Edit
        </button>
        <button className="text-button" onClick={() => setRemove(true)}>
          Delete
        </button>
        {h.sourceImage && (
          <a
            href={"/api/scans/" + encodeURIComponent(h.sourceImage)}
            target="_blank"
            rel="noreferrer"
          >
            Source photo
          </a>
        )}
      </div>
      {remove && (
        <div role="alert">
          <p>Delete this highlight?</p>
          <button
            className="text-button danger"
            onClick={async () => {
              await repo.deleteHighlight(h.id);
              await onChange();
            }}
          >
            Delete highlight
          </button>{" "}
          <button className="text-button" onClick={() => setRemove(false)}>
            Keep it
          </button>
        </div>
      )}
    </article>
  );
}
export function ScanCard({
  scan,
  onChange,
}: {
  scan: repo.LocalScan;
  onChange: () => Promise<void>;
}) {
  const [url, setUrl] = useState(""),
    [passages, setPassages] = useState(scan.passages),
    [error, setError] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(scan.image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [scan.image]);
  // New extraction changes status; background refreshes must not replace a draft.
  const previousStatus = useRef(scan.status);
  useEffect(() => {
    if (previousStatus.current !== scan.status) {
      setPassages(scan.passages);
      previousStatus.current = scan.status;
    }
  }, [scan.status, scan.passages]);
  function changePassages(next: typeof passages) {
    setPassages(next);
    void repo
      .updateScan(scan.id, { passages: next })
      .catch((e) => setError(errorText(e)));
  }
  return (
    <article className="panel scan-card">
      <h2>
        {scan.status === "review"
          ? "Review your scan"
          : scan.status === "failed"
            ? "Photo needs a retry"
            : "Photo saved on this device"}
      </h2>
      {url && <img src={url} alt="Your photographed page" />}
      {scan.status === "pending" && (
        <p>
          Extraction starts when you’re connected. Keep this app open while it
          processes.
        </p>
      )}
      {scan.error && <p role="alert">{scan.error}</p>}
      {scan.warning && <p>{scan.warning}</p>}
      {scan.status === "review" && (
        <>
          <p>
            Check the wording before saving. Remove any passage you don’t want.
          </p>
          {passages.map((p, i) => (
            <label key={i}>
              Passage {i + 1}
              <textarea
                rows={4}
                value={p.text}
                onChange={(e) =>
                  changePassages(
                    passages.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                className="text-button"
                onClick={() =>
                  changePassages(passages.filter((_, j) => j !== i))
                }
              >
                Remove passage
              </button>
            </label>
          ))}
          {passages.length === 0 && (
            <p>No marked passages to save. Try a closer, clearer photo.</p>
          )}
          <button
            className="btn btn-primary"
            disabled={!passages.some((p) => p.text.trim())}
            onClick={async () => {
              try {
                await repo.saveScanHighlights(scan.id, passages);
                await onChange();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Save reviewed highlights
          </button>
        </>
      )}
      {scan.status === "failed" && (
        <button
          className="btn"
          onClick={async () => {
            await repo.updateScan(scan.id, { status: "pending", error: "" });
            await onChange();
          }}
        >
          Retry extraction
        </button>
      )}{" "}
      <button
        className="text-button"
        onClick={async () => {
          await repo.removeScan(scan.id);
          await onChange();
        }}
      >
        Discard photo
      </button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function Search({
  books,
  navigate,
}: {
  books: Book[];
  navigate: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [searched, setSearched] = useState("");
  const results = books.flatMap((b) =>
    b.highlights
      .filter((h) =>
        (h.text + " " + h.note + " " + b.title + " " + b.author)
          .toLowerCase()
          .includes(searched.toLowerCase()),
      )
      .map((h) => ({ b, h })),
  );
  return (
    <section>
      <h1>Search highlights</h1>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearched(query.trim());
        }}
      >
        <label className="sr-only" htmlFor="search">
          Search highlights and notes
        </label>
        <input
          id="search"
          type="search"
          placeholder="Search across all your highlights and notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary">Search</button>
      </form>
      {searched && (
        <div className="search-results" aria-live="polite">
          {results.length === 0 ? (
            <p>No matching highlights.</p>
          ) : (
            results.map(({ b, h }) => (
              <article className="highlight-card" key={h.id}>
                <blockquote>{h.text}</blockquote>
                {h.sourceLink && (
                  <a
                    href={h.sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open passage ↗
                  </a>
                )}
                {h.note && <p className="highlight-note">{h.note}</p>}
                <a
                  href={"#book/" + b.id}
                  onClick={() => navigate("book/" + b.id)}
                >
                  {b.title}
                  {b.author ? ", " + b.author : ""}
                </a>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
function Import({ onChange }: { onChange: () => Promise<void> }) {
  const [paste, setPaste] = useState(""),
    [title, setTitle] = useState(""),
    [author, setAuthor] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(task: () => Promise<string>) {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await task());
      await onChange();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="import-page">
      <h1>Import highlights</h1>
      <h2>Kindle Notebook</h2>
      <p className="help-copy">
        Open a book at{" "}
        <a
          href="https://read.amazon.com/notebook"
          target="_blank"
          rel="noreferrer"
        >
          Kindle Notebook
        </a>
        , select its highlights and paste them below. Repeat imports skip
        duplicates.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await repo.importNotebookPaste({
              paste,
              titleOverride: title,
              authorOverride: author,
            });
            setPaste("");
            return `Imported ${r.imported} highlights. Skipped ${r.skipped} duplicates.`;
          });
        }}
      >
        <label>
          Notebook text
          <textarea
            required
            placeholder="Paste your highlights here..."
            rows={8}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </label>
        <div className="import-fields">
          <label>
            Book title
            <input
              placeholder="Book title (auto-detected)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Author
            <input
              placeholder="Author (auto-detected)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Importing…" : "Import highlights"}
        </button>
      </form>
      <section className="import-file">
        <h2>Import a file</h2>
        <p>
          Use Kindle’s My Clippings.txt or a Book Highlights JSON backup.
          Existing records are kept.
        </p>
        <label className="btn file-button">
          Choose a file
          <input
            type="file"
            accept=".txt,.json,text/plain,application/json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void run(async () => {
                if (f.size > 20 * 1024 * 1024)
                  throw new Error("Choose a file smaller than 20 MB.");
                const text = await f.text();
                if (f.name.toLowerCase().endsWith(".json"))
                  return `Imported ${await repo.importBackup(JSON.parse(text))} highlights.`;
                const r = await repo.importClippings(text);
                return `Imported ${r.imported} highlights. Skipped ${r.skipped} duplicates.`;
              });
              e.target.value = "";
            }}
          />
        </label>
      </section>
      {message && (
        <p className="status-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
