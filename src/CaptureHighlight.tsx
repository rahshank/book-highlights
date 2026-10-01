import { useEffect, useRef, useState } from "react";
import { useArticleMetadata } from "./useArticleMetadata";
import * as repo from "./local/bookRepository";
import {
  canonicalSourceUrl,
  DRAFT_KEY,
  readCaptureDraft,
  textFromFragment,
} from "./shared/capture";
export function CaptureHighlight({
  books,
  sourceId,
  onSaved,
  onCancel,
}: {
  books: repo.LocalBook[];
  sourceId?: string;
  onSaved: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => {
    const saved = readCaptureDraft();
    const b = books.find((b) => b.id === sourceId);
    return b
      ? {
          ...saved,
          sourceId: b.id,
          title: b.title,
          author: b.author,
          url: b.url || "",
          publisher: b.publisher,
          publishedAt: b.publishedAt || "",
        }
      : saved;
  });
  const [source, setSource] = useState(draft.url || draft.title),
    [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false);

  const edited = useRef(new Set<string>());
  const lookup = useArticleMetadata(draft.sourceId ? "" : source);
  useEffect(() => {
    if (!lookup.data) return;
    const data = lookup.data;
    setDraft((previous) => {
      const next = { ...previous };
      for (const key of [
        "title",
        "author",
        "publisher",
        "publishedAt",
      ] as const)
        if (!next[key] && !edited.current.has(key)) next[key] = data[key] || "";
      return next;
    });
  }, [lookup.data]);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft]);
  const isLink = /^https?:\/\//i.test(source.trim());
  const matches = books
    .filter((b) =>
      (b.title + " " + b.author + " " + (b.url || ""))
        .toLowerCase()
        .includes(source.toLowerCase()),
    )
    .slice(0, 6);
  function choose(b: repo.LocalBook, passageLink = b.url || "") {
    setDraft({
      ...draft,
      sourceId: b.id,
      sourceLink: passageLink,
      text: draft.text || textFromFragment(passageLink),
      title: b.title,
      author: b.author,
      url: b.url || "",
      publisher: b.publisher,
      publishedAt: b.publishedAt || "",
    });
    setSource(b.url || b.title);
    setChoosing(false);
  }
  return (
    <section className="capture-panel">
      <h1>Add highlight</h1>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const h = await repo.captureHighlight({
              ...draft,
              url: isLink
                ? canonicalSourceUrl(source)
                : draft.sourceId
                  ? draft.url
                  : "",
              title: isLink
                ? draft.title.trim() || canonicalSourceUrl(source).slice(0, 500)
                : source,
              pageNumber: draft.page ? Number(draft.page) : null,
            });
            try {
              sessionStorage.removeItem(DRAFT_KEY);
            } catch {
              /* Saving remains available. */
            }
            // A fixed destination prevents a foreign opener from receiving private passages.
            window.opener?.postMessage(
              { type: "highlight-saved", captureId: draft.captureId },
              "https://later.rahulshankar.com",
            );
            await onSaved(h.bookId);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save. Please retry.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Highlight
          <textarea
            required
            rows={6}
            maxLength={50000}
            value={draft.text}
            placeholder="Paste a passage"
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
        <div className="source-picker">
          <label>
            Source
            <input
              required
              value={source}
              placeholder="Book title or article link"
              onFocus={() => setChoosing(true)}
              onChange={(e) => {
                const value = e.target.value;
                setSource(value);
                setChoosing(true);
                try {
                  const url = canonicalSourceUrl(value);
                  const existing = books.find(
                    (b) => b.url && canonicalSourceUrl(b.url) === url,
                  );
                  if (existing) {
                    choose(existing, value);
                    return;
                  }
                  if (url && url === canonicalSourceUrl(source)) {
                    setDraft({
                      ...draft,
                      url: value,
                      sourceLink: value,
                      text: draft.text || textFromFragment(value),
                    });
                    return;
                  }
                } catch {
                  /* A book title or incomplete URL. */
                }
                edited.current.clear();
                const link = /^https?:\/\//i.test(value.trim());
                setDraft({
                  ...draft,
                  sourceId: undefined,
                  title: link ? "" : value,
                  url: link ? value : "",
                  author: "",
                  publisher: "",
                  publishedAt: "",
                  sourceLink: link ? value : "",
                  text: draft.text || textFromFragment(value),
                });
              }}
            />
          </label>
          {choosing && matches.length > 0 && (
            <div className="source-options" aria-label="Existing sources">
              {matches.map((b) => (
                <button key={b.id} type="button" onClick={() => choose(b)}>
                  {b.title}
                  {b.author && <small>{b.author}</small>}
                </button>
              ))}
            </div>
          )}
          {draft.sourceId && (
            <>
              <small>Adding to an existing source.</small>
              <p className="book-meta">
                {draft.title}
                {draft.author && ` · ${draft.author}`}
              </p>
            </>
          )}
        </div>
        {lookup.status && (
          <p role="status" className="book-meta">
            {lookup.status}
          </p>
        )}
        {isLink && !draft.sourceId && (
          <label>
            Article title (optional)
            <input
              placeholder="Uses the link if left blank"
              value={draft.title}
              onChange={(e) => {
                edited.current.add("title");
                setDraft({ ...draft, title: e.target.value });
              }}
            />
          </label>
        )}
        {!draft.sourceId && (
          <label>
            <span>
              Author <span className="optional">(optional)</span>
            </span>
            <input
              value={draft.author}
              onChange={(e) => {
                edited.current.add("author");
                setDraft({ ...draft, author: e.target.value });
              }}
            />
          </label>
        )}
        <label>
          <span>
            Note <span className="optional">(optional)</span>
          </span>
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </label>
        <details>
          <summary>More details</summary>
          <div className="stack">
            {!(isLink || draft.url) && (
              <label>
                Page
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.page}
                  onChange={(e) => setDraft({ ...draft, page: e.target.value })}
                />
              </label>
            )}
            {isLink && !draft.sourceId && (
              <>
                <label>
                  Publisher
                  <input
                    value={draft.publisher}
                    onChange={(e) => {
                      edited.current.add("publisher");
                      setDraft({ ...draft, publisher: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Published
                  <input
                    type="date"
                    value={draft.publishedAt.slice(0, 10)}
                    onChange={(e) => {
                      edited.current.add("publishedAt");
                      setDraft({ ...draft, publishedAt: e.target.value });
                    }}
                  />
                </label>
              </>
            )}
            {(isLink || draft.url) && (
              <label>
                Link to passage
                <input
                  type="url"
                  value={draft.sourceLink}
                  onChange={(e) =>
                    setDraft({ ...draft, sourceLink: e.target.value })
                  }
                />
              </label>
            )}
          </div>
        </details>
        {storageError && (
          <p role="status">
            This browser cannot keep a draft. Save before leaving this page.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save highlight"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              sessionStorage.removeItem(DRAFT_KEY);
              onCancel();
            }}
          >
            Discard draft
          </button>
        </div>
      </form>
    </section>
  );
}
