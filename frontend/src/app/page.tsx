"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBooks, createBook, deleteBook, lookupISBN, type BookSummary } from "@/lib/api";

export default function HomePage() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  async function loadBooks() {
    try {
      setBooks(await getBooks());
    } catch {
      setMessage({ type: "error", text: "Failed to load books" });
    } finally {
      setLoading(false);
    }
  }

  async function handleISBNLookup() {
    if (!isbn.trim()) return;
    try {
      const data = await lookupISBN(isbn.trim());
      setTitle(data.title);
      setAuthor(data.author);
    } catch {
      setMessage({ type: "error", text: "ISBN not found" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createBook({ title: title.trim(), author: author.trim(), isbn: isbn.trim() });
      setTitle("");
      setAuthor("");
      setIsbn("");
      setShowForm(false);
      setMessage({ type: "success", text: "Book added" });
      loadBooks();
    } catch {
      setMessage({ type: "error", text: "Failed to add book" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this book and all its highlights?")) return;
    try {
      await deleteBook(id);
      loadBooks();
    } catch {
      setMessage({ type: "error", text: "Failed to delete book" });
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Your Library</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Book"}
        </button>
      </div>

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

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: "2rem" }}>
          <div className="form-group">
            <label>ISBN (optional - auto-fills title and author)</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="e.g. 9780141036144"
              />
              <button type="button" className="btn" onClick={handleISBNLookup}>
                Lookup
              </button>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book title"
                required
              />
            </div>
            <div className="form-group">
              <label>Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Add Book
          </button>
        </form>
      )}

      {loading ? null : books.length === 0 ? (
        <div className="empty">
          <p>No books yet. Add a book or import Kindle highlights to get started.</p>
        </div>
      ) : (
        books.map((book) => (
          <div key={book.id} className="book-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <Link href={`/books/${book.id}`}>
                <h3>{book.title}</h3>
                {book.author && <div className="meta">{book.author}</div>}
                <div className="meta">
                  {book.highlight_count} highlight{book.highlight_count !== 1 ? "s" : ""}
                  {" \u00b7 "}
                  {book.source}
                </div>
              </Link>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(book.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
