"use client";

import { useState } from "react";
import Link from "next/link";
import { importKindle, importNotebookPaste, type BookSummary } from "@/lib/api";

export default function ImportPage() {
  // --- File import state ---
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BookSummary[] | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // --- Paste import state ---
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteAuthor, setPasteAuthor] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteResult, setPasteResult] = useState<BookSummary | null>(null);
  const [pasteMessage, setPasteMessage] = useState<{ type: string; text: string } | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const books = await importKindle(file);
      setResults(books);
      const totalHighlights = books.reduce((sum, b) => sum + b.highlight_count, 0);
      setMessage({
        type: "success",
        text: `Imported ${totalHighlights} highlights across ${books.length} books`,
      });
    } catch {
      setMessage({ type: "error", text: "Failed to import Kindle highlights" });
    } finally {
      setImporting(false);
    }
  }

  async function handlePasteImport(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setPasting(true);
    setPasteMessage(null);
    setPasteResult(null);
    try {
      const book = await importNotebookPaste({
        text: pasteText,
        title: pasteTitle || undefined,
        author: pasteAuthor || undefined,
      });
      setPasteResult(book);
      if (book.highlight_count === 0) {
        setPasteMessage({
          type: "success",
          text: `"${book.title}" is up to date — no new highlights to import`,
        });
      } else {
        setPasteMessage({
          type: "success",
          text: `Imported ${book.highlight_count} new highlight${book.highlight_count === 1 ? "" : "s"} into "${book.title}"`,
        });
      }
      setPasteText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to import highlights";
      setPasteMessage({ type: "error", text: msg });
    } finally {
      setPasting(false);
    }
  }

  return (
    <>
      <h1>Import Highlights</h1>

      {/* --- Notebook paste import --- */}
      <h2>Kindle Notebook (paste from web)</h2>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Go to{" "}
        <a href="https://read.amazon.com/notebook" target="_blank" rel="noopener noreferrer">
          read.amazon.com/notebook
        </a>
        , select a book, then select all highlights (Ctrl+A / Cmd+A) and copy-paste
        them below. Safe to repeat — duplicates are skipped automatically.
      </p>

      {pasteMessage && (
        <div className={`message message-${pasteMessage.type}`}>
          {pasteMessage.text}
          <button
            onClick={() => setPasteMessage(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}
          >
            &times;
          </button>
        </div>
      )}

      <form onSubmit={handlePasteImport}>
        <div className="form-group">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Paste your highlights here...\n\nExample format:\nYellow highlight | Location: 150\nThe actual highlighted text..."}
            rows={10}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border, #ddd)",
              fontFamily: "inherit",
              fontSize: "0.9rem",
              resize: "vertical",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <input
              type="text"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Book title (auto-detected from paste)"
              style={{ width: "100%" }}
            />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <input
              type="text"
              value={pasteAuthor}
              onChange={(e) => setPasteAuthor(e.target.value)}
              placeholder="Author (auto-detected from paste)"
              style={{ width: "100%" }}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!pasteText.trim() || pasting}
        >
          {pasting ? "Importing..." : "Import from Paste"}
        </button>
      </form>

      {pasteResult && (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="book-card">
            <Link href={`/books/${pasteResult.id}`}>
              <h3>{pasteResult.title}</h3>
              {pasteResult.author && <div className="meta">{pasteResult.author}</div>}
              <div className="meta">{pasteResult.highlight_count} new highlights</div>
            </Link>
          </div>
        </div>
      )}

      <hr style={{ margin: "2.5rem 0", borderColor: "var(--border, #ddd)" }} />

      {/* --- File import (My Clippings.txt) --- */}
      <h2>Kindle File (My Clippings.txt)</h2>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Connect your Kindle via USB and find the <code>My Clippings.txt</code> file
        in the <code>documents</code> folder. Upload it here to import all your
        highlights and notes.
      </p>

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
          <button
            onClick={() => setMessage(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}
          >
            &times;
          </button>
        </div>
      )}

      <form onSubmit={handleImport}>
        <div className="form-group">
          <div
            className={`upload-area ${file ? "active" : ""}`}
            onClick={() => document.getElementById("kindle-input")?.click()}
          >
            {file ? file.name : "Click to select My Clippings.txt"}
            <input
              id="kindle-input"
              type="file"
              accept=".txt"
              style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!file || importing}
        >
          {importing ? "Importing..." : "Import Highlights"}
        </button>
      </form>

      {results && results.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Imported Books</h2>
          {results.map((book) => (
            <div key={book.id} className="book-card">
              <Link href={`/books/${book.id}`}>
                <h3>{book.title}</h3>
                {book.author && <div className="meta">{book.author}</div>}
                <div className="meta">{book.highlight_count} new highlights</div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
