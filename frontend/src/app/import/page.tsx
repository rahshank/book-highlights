"use client";

import { useState } from "react";
import Link from "next/link";
import { importKindle, type BookSummary } from "@/lib/api";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BookSummary[] | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

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

  return (
    <>
      <h1>Import Highlights</h1>

      <h2>Kindle (My Clippings.txt)</h2>
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
